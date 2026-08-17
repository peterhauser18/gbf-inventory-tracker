import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  isVerifiedCombatResponseUrl as isBaseVerifiedCombatResponseUrl,
  parseVerifiedMultiraidObservation as parseBaseVerifiedMultiraidObservation,
  type CombatActorContext,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import type { ParsedCombatAction, ParsedDamageHit } from './types.ts';

type Obj = Record<string, unknown>;
type TimedActorSource = { actor: CombatActorContext; step: number };
type TimedPartySource = { name: string; step: number };

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
const SOURCE_WINDOW_COMMANDS = new Set([
  'attack',
  'ability',
  'chain_cutin',
  'damage',
  'loop_damage',
  'special',
  'special_npc',
  'summon',
  'wait',
]);
const BASE_DAMAGE_COMMANDS = new Set([
  'attack',
  'damage',
  'loop_damage',
  'special',
  'special_npc',
  'summon',
]);
const NON_DAMAGE_COMMANDS = new Set(['heal']);

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

  repairScenarioDamageEvidence(record.body, observation, context, fatedChain);
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
    if (!action.hits.length) continue;
    action.kind = 'other';
    action.hits = action.hits.map((hit) => ({ ...hit, kind: 'other' }));
    if (!action.name || action.name === 'Chain Burst') action.name = 'Fated Chain';
  }
}

function repairScenarioDamageEvidence(
  body: unknown,
  observation: VerifiedCombatObservation,
  context?: CombatParseContext,
  fatedChain = false,
): void {
  if (!obj(body) || !Array.isArray(body.scenario)) return;

  const slots = (context?.actorSlots ?? []).map((actor) => ({ ...actor }));
  let chargeSource: TimedActorSource | undefined;
  let partySource: TimedPartySource | undefined;
  let sourceStep = 0;
  let ownerBoundaryObserved = false;
  const matchedActions = new Set<ParsedCombatAction>();
  let extraGaps = 0;

  for (const raw of body.scenario) {
    if (!obj(raw)) continue;
    const cmd = str(raw.cmd)?.toLowerCase();
    if (!cmd) continue;
    if (SOURCE_WINDOW_COMMANDS.has(cmd)) sourceStep += 1;

    const target = (cmd === 'special' || cmd === 'special_npc')
      ? str(raw.target, raw.to)?.toLowerCase()
      : str(raw.to, raw.target)?.toLowerCase();

    if (cmd === 'special' || cmd === 'special_npc') {
      const actor = target === 'boss' ? actorAt(slots, num(raw.pos)) : undefined;
      chargeSource = actor?.id ? { actor: { ...actor }, step: sourceStep } : undefined;
      partySource = undefined;
      ownerBoundaryObserved = false;
    } else if (cmd === 'chain_cutin') {
      chargeSource = undefined;
      partySource = { name: fatedChain ? 'Fated Chain' : 'Chain Burst', step: sourceStep };
      ownerBoundaryObserved = false;
    } else if (cmd === 'wait') {
      chargeSource = undefined;
      partySource = undefined;
      ownerBoundaryObserved = true;
    } else if (
      (cmd === 'attack' && str(raw.from)?.toLowerCase() === 'player') ||
      cmd === 'ability' ||
      cmd === 'summon'
    ) {
      chargeSource = undefined;
      partySource = undefined;
      ownerBoundaryObserved = false;
    }

    if ((cmd === 'damage' || cmd === 'loop_damage') && target === 'boss') {
      const payload = raw.list ?? raw.damage;
      if (isFreshSource(chargeSource, sourceStep) && chargeSource?.actor.id) {
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
            {
              matchAnyAttribution: true,
              replaceName: true,
              extractContained: true,
            },
          );
        } else if (payload !== undefined) {
          extraGaps += 1;
        }
      } else if (isFreshSource(partySource, sourceStep)) {
        const rawHits = damageHits(payload, 'other');
        if (rawHits.length) {
          const resultActor = fatedChain ? undefined : mainCharacterActor(context, slots);
          preserveObservedDamage(
            observation,
            matchedActions,
            rawHits,
            'other',
            partySource?.name ?? 'Party follow-up',
            resultActor,
            context?.turn,
            {
              matchAnyAttribution: true,
              replaceName: !fatedChain,
              extractContained: true,
            },
          );
        } else if (payload !== undefined) {
          extraGaps += 1;
        }
      } else if (ownerBoundaryObserved) {
        const rawHits = damageHits(payload, 'other');
        if (rawHits.length) {
          preserveObservedDamage(
            observation,
            matchedActions,
            rawHits,
            'other',
            'Unclassified damage',
            undefined,
            context?.turn,
            {
              matchAnyAttribution: true,
              replaceName: true,
              extractContained: true,
              clearAttribution: true,
            },
          );
          extraGaps += 1;
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
  matchedActions: Set<ParsedCombatAction>,
  rawHits: ParsedDamageHit[],
  kind: ParsedDamageHit['kind'],
  name: string,
  actor: CombatActorContext | undefined,
  fallbackTurn: number | undefined,
  options: {
    matchAnyAttribution?: boolean;
    replaceName?: boolean;
    extractContained?: boolean;
    clearAttribution?: boolean;
  } = {},
): void {
  const actionIndex = observation.actions.findIndex((action) =>
    !matchedActions.has(action) &&
    sameDamageSequence(rawHits, action.hits) &&
    (options.matchAnyAttribution || (!action.actorId && action.kind === 'other')),
  );

  if (actionIndex >= 0) {
    const action = observation.actions[actionIndex];
    if (!action) return;
    applyObservedAttribution(action, rawHits, kind, name, actor, options);
    matchedActions.add(action);
    return;
  }

  if (options.extractContained) {
    const containingIndex = observation.actions.findIndex((action) =>
      !matchedActions.has(action) &&
      (options.matchAnyAttribution || (!action.actorId && action.kind === 'other')) &&
      damageSubsequenceStart(action.hits, rawHits) >= 0,
    );
    if (containingIndex >= 0) {
      const action = observation.actions[containingIndex];
      if (action) {
        const start = damageSubsequenceStart(action.hits, rawHits);
        const extractedHits = action.hits
          .slice(start, start + rawHits.length)
          .map((hit) => ({ ...hit, kind }));
        action.hits = [
          ...action.hits.slice(0, start),
          ...action.hits.slice(start + rawHits.length),
        ];

        const extracted: ParsedCombatAction = {
          observedAt: action.observedAt,
          turn: action.turn ?? observation.observedTurn ?? fallbackTurn,
          kind: 'other',
          name,
          hits: extractedHits,
        };
        if (!options.clearAttribution && actor?.id) {
          extracted.actorId = actor.id;
          extracted.actorName = actor.name;
        }
        observation.actions.splice(containingIndex + 1, 0, extracted);
        matchedActions.add(extracted);
        observation.actionsFieldPresent = true;
        return;
      }
    }
  }

  const appended: ParsedCombatAction = {
    observedAt: observation.observedAt,
    turn: observation.observedTurn ?? fallbackTurn,
    kind: 'other',
    name,
    hits: rawHits,
  };
  if (!options.clearAttribution && actor?.id) {
    appended.actorId = actor.id;
    appended.actorName = actor.name;
  }
  observation.actions.push(appended);
  matchedActions.add(appended);
  observation.actionsFieldPresent = true;
}

function applyObservedAttribution(
  action: ParsedCombatAction,
  rawHits: readonly ParsedDamageHit[],
  kind: ParsedDamageHit['kind'],
  name: string,
  actor: CombatActorContext | undefined,
  options: { replaceName?: boolean; clearAttribution?: boolean },
): void {
  if (options.clearAttribution) {
    delete action.actorId;
    delete action.actorName;
  } else if (actor?.id) {
    action.actorId = actor.id;
    action.actorName = actor.name;
  }
  action.kind = 'other';
  action.name = options.replaceName ? name : (action.name ?? name);
  action.hits = action.hits.map((hit, index) => ({
    ...hit,
    kind: rawHits[index]?.kind ?? kind,
  }));
}

function sameDamageSequence(
  left: readonly ParsedDamageHit[],
  right: readonly ParsedDamageHit[],
): boolean {
  return left.length === right.length && left.every((hit, index) => hit.amount === right[index]?.amount);
}

function damageSubsequenceStart(
  haystack: readonly ParsedDamageHit[],
  needle: readonly ParsedDamageHit[],
): number {
  if (!needle.length || needle.length > haystack.length) return -1;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((hit, offset) => hit.amount === haystack[start + offset]?.amount)) return start;
  }
  return -1;
}

function mainCharacterActor(
  context: CombatParseContext | undefined,
  slots: readonly CombatActorContext[],
): CombatActorContext | undefined {
  const id = context?.mainCharacterId;
  if (id) {
    const actor = slots.find((slot) => slot.id === id);
    return actor ? { ...actor } : { id };
  }
  const actor = slots[0];
  return actor?.id ? { ...actor } : undefined;
}

function isFreshSource(
  source: { step: number } | undefined,
  currentStep: number,
): boolean {
  return Boolean(
    source &&
    currentStep > source.step &&
    currentStep - source.step <= FOLLOW_UP_LOOKBACK,
  );
}

function isUnknownBossDamageCommand(raw: Obj, cmd: string): boolean {
  if (BASE_DAMAGE_COMMANDS.has(cmd) || NON_DAMAGE_COMMANDS.has(cmd)) return false;
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
