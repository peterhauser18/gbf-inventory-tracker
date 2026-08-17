import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  isVerifiedCombatResponseUrl as isBaseVerifiedCombatResponseUrl,
  parseVerifiedMultiraidObservation as parseBaseVerifiedMultiraidObservation,
  type CombatActorContext,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import type { BossState, ParsedCombatAction, ParsedDamageHit, RaidResult } from './types.ts';

type Obj = Record<string, unknown>;

export { mergeVerifiedMultiraidObservation } from './multiraid.ts';
export type {
  CombatActorContext,
  CombatParseContext,
  CombatParticipantDisplay,
  CombatSummonContext,
  VerifiedCombatObservation,
} from './multiraid.ts';

const FATED_CHAIN_PATH = '/rest/multiraid/fatal_chain_result.json';
const BASE_DAMAGE_COMMANDS = new Set([
  'attack',
  'damage',
  'loop_damage',
  'special',
  'special_npc',
  'summon',
]);

export function isVerifiedCombatResponseUrl(url: string): boolean {
  return isBaseVerifiedCombatResponseUrl(url) || responsePath(url) === FATED_CHAIN_PATH;
}

export function parseVerifiedMultiraidObservation(
  record: CapturedResponseRecord,
  context?: CombatParseContext,
): VerifiedCombatObservation | null {
  if (responsePath(record.meta.url) === FATED_CHAIN_PATH) {
    return context ? parseFatedChainObservation(record, context) : null;
  }

  const normalized = normalizeSpecialNpcRecord(record);
  const observation = parseBaseVerifiedMultiraidObservation(normalized, context);
  if (!observation) return null;
  repairScenarioDamageEvidence(record.body, observation, context);
  return observation;
}

function normalizeSpecialNpcRecord(record: CapturedResponseRecord): CapturedResponseRecord {
  if (!obj(record.body) || !Array.isArray(record.body.scenario)) return record;
  let changed = false;
  const scenario = record.body.scenario.map((value) => {
    if (!obj(value) || str(value.cmd)?.toLowerCase() !== 'special_npc') return value;
    changed = true;
    return { ...value, cmd: 'special' };
  });
  return changed ? { ...record, body: { ...record.body, scenario } } : record;
}

function repairScenarioDamageEvidence(
  body: unknown,
  observation: VerifiedCombatObservation,
  context?: CombatParseContext,
): void {
  if (!obj(body) || !Array.isArray(body.scenario)) return;

  const slots = (context?.actorSlots ?? []).map((actor) => ({ ...actor }));
  let chargeSource: CombatActorContext | undefined;
  const matchedActions = new Set<number>();
  let extraGaps = 0;

  for (const raw of body.scenario) {
    if (!obj(raw)) continue;
    const cmd = str(raw.cmd)?.toLowerCase();
    if (!cmd) continue;

    if (cmd === 'special' || cmd === 'special_npc') {
      chargeSource = str(raw.target, raw.to)?.toLowerCase() === 'boss'
        ? actorAt(slots, num(raw.pos))
        : undefined;
    } else if (
      (cmd === 'attack' && str(raw.from)?.toLowerCase() === 'player') ||
      cmd === 'ability' ||
      cmd === 'summon'
    ) {
      chargeSource = undefined;
    }

    if (
      cmd === 'loop_damage' &&
      str(raw.to, raw.target)?.toLowerCase() === 'boss' &&
      chargeSource?.id
    ) {
      const rawHits = damageHits(raw.list, 'skill');
      if (rawHits.length) {
        const total = rawHits.reduce((sum, hit) => sum + hit.amount, 0);
        const actionIndex = observation.actions.findIndex((action, index) =>
          !matchedActions.has(index) &&
          !action.actorId &&
          action.kind === 'other' &&
          action.hits.reduce((sum, hit) => sum + hit.amount, 0) === total,
        );
        if (actionIndex >= 0) {
          const action = observation.actions[actionIndex];
          if (action) {
            action.actorId = chargeSource.id;
            action.actorName = chargeSource.name;
            action.name ??= 'C.A. follow-up';
            action.hits = action.hits.map((hit) => ({ ...hit, kind: 'skill' }));
            matchedActions.add(actionIndex);
          }
        } else {
          observation.actions.push({
            observedAt: observation.observedAt,
            turn: observation.observedTurn ?? context?.turn,
            actorId: chargeSource.id,
            actorName: chargeSource.name,
            kind: 'other',
            name: 'C.A. follow-up',
            hits: rawHits,
          });
          observation.actionsFieldPresent = true;
        }
      } else if (raw.list !== undefined) {
        extraGaps += 1;
      }
      chargeSource = undefined;
    } else if (isUnknownBossDamageCommand(raw, cmd)) {
      const rawHits = damageHits(raw.list ?? raw.damage, 'other');
      if (rawHits.length) {
        observation.actions.push({
          observedAt: observation.observedAt,
          turn: observation.observedTurn ?? context?.turn,
          kind: 'other',
          name: `Unclassified ${cmd}`,
          hits: rawHits,
        });
        observation.actionsFieldPresent = true;
      }
      extraGaps += 1;
    }

    if (cmd === 'die' && str(raw.to, raw.target)?.toLowerCase() === 'player') {
      for (const pos of playerDeathPositions(raw)) promoteBackline(slots, pos);
    }
  }

  observation.unparsedActionCount += extraGaps;
}

function parseFatedChainObservation(
  record: CapturedResponseRecord,
  context: CombatParseContext,
): VerifiedCombatObservation | null {
  if (!obj(record.body)) return null;
  const scenario = Array.isArray(record.body.scenario) ? record.body.scenario : [];
  const actions: ParsedCombatAction[] = [];
  let gaps = 0;

  for (const raw of scenario) {
    if (!obj(raw) || str(raw.to, raw.target)?.toLowerCase() !== 'boss') continue;
    const payload = raw.list ?? raw.damage;
    if (payload === undefined) continue;
    const hits = damageHits(payload, 'other');
    if (!hits.length) {
      gaps += 1;
      continue;
    }
    actions.push({
      observedAt: record.meta.capturedAt,
      turn: context.turn,
      kind: 'other',
      name: 'Fated Chain',
      hits,
    });
  }

  const boss = scenarioBoss(scenario);
  const contributionDelta = scenarioContribution(scenario);
  const result = scenarioResult(scenario);
  if (!scenario.length && !boss && contributionDelta === undefined && result === undefined) return null;

  return {
    raidTechnicalId: context.raidTechnicalId,
    observedAt: record.meta.capturedAt,
    observedTurn: context.turn,
    startObserved: false,
    result,
    boss,
    contributionDelta,
    actions,
    actionsFieldPresent: scenario.length > 0,
    unparsedActionCount: gaps,
    drops: [],
    dropsQuality: 'unknown',
    context: cloneContext(context),
  };
}

function isUnknownBossDamageCommand(raw: Obj, cmd: string): boolean {
  if (BASE_DAMAGE_COMMANDS.has(cmd)) return false;
  if (str(raw.to, raw.target)?.toLowerCase() !== 'boss') return false;
  return raw.list !== undefined || raw.damage !== undefined;
}

function damageHits(value: unknown, kind: ParsedDamageHit['kind']): ParsedDamageHit[] {
  const amounts: number[] = [];
  collectDamageAmounts(value, amounts);
  return amounts.map((amount) => ({ amount, kind }));
}

function collectDamageAmounts(value: unknown, out: number[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDamageAmounts(item, out);
    return;
  }
  if (!obj(value)) return;
  const amount = num(value.value);
  if (amount !== undefined) {
    out.push(amount);
    return;
  }
  for (const child of Object.values(value)) collectDamageAmounts(child, out);
}

function playerDeathPositions(raw: Obj): number[] {
  const positions = new Set<number>();
  const direct = num(raw.pos);
  if (direct !== undefined) positions.add(direct);
  collectPositions(raw.list, positions);
  return [...positions];
}

function collectPositions(value: unknown, positions: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPositions(item, positions);
    return;
  }
  if (!obj(value)) return;
  const pos = num(value.pos);
  if (pos !== undefined) positions.add(pos);
  for (const child of Object.values(value)) collectPositions(child, positions);
}

function promoteBackline(slots: CombatActorContext[], pos: number): void {
  if (!Number.isInteger(pos) || pos < 0 || pos >= 4 || pos >= slots.length) return;
  const incoming = slots[4];
  if (!incoming?.id) return;
  slots[pos] = { ...incoming };
  slots[4] = slots[5] ? { ...slots[5] } : {};
  slots[5] = {};
}

function actorAt(slots: readonly CombatActorContext[], pos: number | undefined): CombatActorContext | undefined {
  if (pos === undefined || !Number.isInteger(pos) || pos < 0) return undefined;
  return slots[pos];
}

function scenarioBoss(scenario: unknown[]): BossState | undefined {
  let latest: BossState | undefined;
  for (const value of scenario) {
    if (!obj(value) || str(value.cmd)?.toLowerCase() !== 'boss_gauge') continue;
    const hp = num(value.hp);
    const maxHp = num(value.hpmax, value.max_hp);
    const name = localizedText(value.name);
    if (hp === undefined && maxHp === undefined && !name) continue;
    latest = {
      name,
      hp,
      maxHp,
      hpPercent: hp !== undefined && maxHp !== undefined && maxHp > 0 ? hp / maxHp * 100 : undefined,
      quality: hp !== undefined ? 'known' : 'partial',
    };
  }
  return latest;
}

function scenarioContribution(scenario: unknown[]): number | undefined {
  let total = 0;
  let observed = false;
  for (const value of scenario) {
    if (!obj(value) || str(value.cmd)?.toLowerCase() !== 'contribution') continue;
    const amount = num(value.amount);
    if (amount === undefined) continue;
    total += amount;
    observed = true;
  }
  return observed ? total : undefined;
}

function scenarioResult(scenario: unknown[]): Exclude<RaidResult, 'active'> | undefined {
  let bossDied = false;
  let terminalDrop = false;
  for (const value of scenario) {
    if (!obj(value)) continue;
    const cmd = str(value.cmd)?.toLowerCase();
    if (cmd === 'win') return 'victory';
    if (cmd === 'die' && str(value.to)?.toLowerCase() === 'boss') bossDied = true;
    if (cmd === 'drop') terminalDrop = true;
  }
  return bossDied && terminalDrop ? 'victory' : undefined;
}

function cloneContext(context: CombatParseContext): CombatParseContext {
  return {
    ...context,
    actorSlots: context.actorSlots.map((actor) => ({ ...actor })),
    actors: context.actors?.map((actor) => ({ ...actor })),
    summons: context.summons?.map((summon) => ({ ...summon })),
    participants: context.participants?.map((participant) => ({ ...participant })),
  };
}

function responsePath(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function localizedText(value: unknown): string | undefined {
  if (typeof value === 'string') return str(value);
  if (!obj(value)) return undefined;
  return str(value.en, value.ja, ...Object.values(value));
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function num(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return undefined;
}
