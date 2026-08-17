import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  isVerifiedCombatResponseUrl as isBaseVerifiedCombatResponseUrl,
  parseVerifiedMultiraidObservation as parseBaseVerifiedMultiraidObservation,
  type CombatActorContext,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import type { ParsedDamageHit } from './types.ts';

type Obj = Record<string, unknown>;
type TimedActorSource = { actor: CombatActorContext; index: number };
type TimedPartySource = { name: string; index: number };

export { mergeVerifiedMultiraidObservation } from './multiraid.ts';
export type {
  CombatActorContext,
  CombatParseContext,
  CombatParticipantDisplay,
  CombatSummonContext,
  VerifiedCombatObservation,
} from './multiraid.ts';

const FATED_CHAIN_PATH = '/rest/multiraid/fatal_chain_result.json';
const ABILITY_RESULT_PATH = '/rest/multiraid/ability_result.json';
const FOLLOW_UP_LOOKBACK = 4;
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
  const fatedChain = responsePath(record.meta.url) === FATED_CHAIN_PATH;
  const normalized = normalizeVerifiedRecord(record, fatedChain);
  const observation = parseBaseVerifiedMultiraidObservation(normalized, context);
  if (!observation) return null;

  repairScenarioDamageEvidence(record.body, observation, context);
  if (fatedChain) labelFatedChainDamage(observation);
  return observation;
}

function normalizeVerifiedRecord(
  record: CapturedResponseRecord,
  fatedChain: boolean,
): CapturedResponseRecord {
  const body = normalizeSpecialNpcBody(record.body);
  if (!fatedChain && body === record.body) return record;
  return {
    ...record,
    meta: fatedChain
      ? { ...record.meta, url: `${new URL(record.meta.url).origin}${ABILITY_RESULT_PATH}` }
      : record.meta,
    body,
  };
}

function normalizeSpecialNpcBody(body: unknown): unknown {
  if (!obj(body) || !Array.isArray(body.scenario)) return body;
  let changed = false;
  const scenario = body.scenario.map((value) => {
    if (!obj(value) || str(value.cmd)?.toLowerCase() !== 'special_npc') return value;
    changed = true;
    return { ...value, cmd: 'special' };
  });
  return changed ? { ...body, scenario } : body;
}

function labelFatedChainDamage(observation: VerifiedCombatObservation): void {
  for (const action of observation.actions) {
    if (!action.actorId && action.kind === 'other' && action.hits.length > 0) {
      action.name = 'Fated Chain';
    }
  }
}

function repairScenarioDamageEvidence(
  body: unknown,
  observation: VerifiedCombatObservation,
  context?: CombatParseContext,
): void {
  if (!obj(body) || !Array.isArray(body.scenario)) return;

  const slots = (context?.actorSlots ?? []).map((actor) => ({ ...actor }));
  let chargeSource: TimedActorSource | undefined;
  let partySource: TimedPartySource | undefined;
  const matchedActions = new Set<number>();
  let extraGaps = 0;

  for (let index = 0; index < body.scenario.length; index++) {
    const raw = body.scenario[index];
    if (!obj(raw)) continue;
    const cmd = str(raw.cmd)?.toLowerCase();
    if (!cmd) continue;
    const target = str(raw.to, raw.target)?.toLowerCase();

    if (cmd === 'special' || cmd === 'special_npc') {
      const actor = target === 'boss' ? actorAt(slots, num(raw.pos)) : undefined;
      chargeSource = actor?.id ? { actor: { ...actor }, index } : undefined;
      partySource = undefined;
    } else if (cmd === 'chain_cutin') {
      chargeSource = undefined;
      partySource = { name: 'Chain Burst', index };
    } else if (cmd === 'wait') {
      chargeSource = undefined;
      partySource = undefined;
    } else if (
      (cmd === 'attack' && str(raw.from)?.toLowerCase() === 'player') ||
      cmd === 'ability' ||
      cmd === 'summon'
    ) {
      chargeSource = undefined;
      partySource = undefined;
    }

    if ((cmd === 'damage' || cmd === 'loop_damage') && target === 'boss') {
      const payload = raw.list ?? raw.damage;
      if (isFreshSource(chargeSource, index) && chargeSource?.actor.id) {
        const rawHits = damageHits(payload, 'skill');
        if (rawHits.length) {
          preserveObservedDamage(
            observation,
            matchedActions,
            rawHits,
            'skill',
            'C.A. follow-up',
            chargeSource.actor,
            context?.turn,
          );
        } else if (payload !== undefined) {
          extraGaps += 1;
        }
      } else if (isFreshSource(partySource, index)) {
        const rawHits = damageHits(payload, 'other');
        if (rawHits.length) {
          preserveObservedDamage(
            observation,
            matchedActions,
            rawHits,
            'other',
            partySource?.name ?? 'Party follow-up',
            undefined,
            context?.turn,
          );
        } else if (payload !== undefined) {
          extraGaps += 1;
        }
      }
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

    if (cmd === 'die' && target === 'player') {
      for (const pos of playerDeathPositions(raw)) promoteBackline(slots, pos);
    }
  }

  observation.unparsedActionCount += extraGaps;
}

function preserveObservedDamage(
  observation: VerifiedCombatObservation,
  matchedActions: Set<number>,
  rawHits: ParsedDamageHit[],
  kind: ParsedDamageHit['kind'],
  name: string,
  actor: CombatActorContext | undefined,
  fallbackTurn: number | undefined,
): void {
  const total = rawHits.reduce((sum, hit) => sum + hit.amount, 0);
  const actionIndex = observation.actions.findIndex((action, index) =>
    !matchedActions.has(index) &&
    !action.actorId &&
    action.kind === 'other' &&
    action.hits.reduce((sum, hit) => sum + hit.amount, 0) === total,
  );

  if (actionIndex >= 0) {
    const action = observation.actions[actionIndex];
    if (!action) return;
    action.actorId = actor?.id;
    action.actorName = actor?.name;
    action.name ??= name;
    action.hits = action.hits.map((hit) => ({ ...hit, kind }));
    matchedActions.add(actionIndex);
    return;
  }

  observation.actions.push({
    observedAt: observation.observedAt,
    turn: observation.observedTurn ?? fallbackTurn,
    actorId: actor?.id,
    actorName: actor?.name,
    kind: 'other',
    name,
    hits: rawHits,
  });
  observation.actionsFieldPresent = true;
}

function isFreshSource(
  source: { index: number } | undefined,
  currentIndex: number,
): boolean {
  return Boolean(
    source &&
    currentIndex > source.index &&
    currentIndex - source.index <= FOLLOW_UP_LOOKBACK,
  );
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

function actorAt(
  slots: readonly CombatActorContext[],
  pos: number | undefined,
): CombatActorContext | undefined {
  if (pos === undefined || !Number.isInteger(pos) || pos < 0) return undefined;
  return slots[pos];
}

function responsePath(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
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
