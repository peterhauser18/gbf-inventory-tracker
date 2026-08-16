import { classifyVerifiedNormalDamage, criticalDecision } from './damage-semantics.ts';
import type { CombatSummonContext, VerifiedCombatObservation } from './multiraid.ts';
import type { NormalizedRaidParse, ParsedCombatAction, ParsedDamageHit } from './types.ts';

type Obj = Record<string, unknown>;

export function enrichVerifiedScenarioSemantics(body: unknown, observation: VerifiedCombatObservation): void {
  if (!obj(body)) return;
  enrichVerifiedSummonContext(body, observation);
  if (!Array.isArray(body.scenario)) return;
  const rawGroups = verifiedNormalGroups(body.scenario);
  const normalActions = observation.actions.filter((action) => action.kind === 'normal');
  const count = Math.min(rawGroups.length, normalActions.length);

  for (let index = 0; index < count; index += 1) {
    const rawHits = rawGroups[index];
    const action = normalActions[index];
    if (!rawHits || !action || !sameDamageSequence(rawHits, action.hits)) continue;
    action.hits = classifyVerifiedNormalDamage(rawHits);
    action.critical = criticalDecision(rawHits);
  }
}

export function preserveVerifiedNormalFacts(
  parse: NormalizedRaidParse,
  actions: readonly ParsedCombatAction[],
): void {
  const firstNewLogIndex = Math.max(0, parse.log.length - actions.length);
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (action?.kind !== 'normal') continue;
    const entry = parse.log[firstNewLogIndex + index];
    if (!entry || entry.actionKind !== 'normal') continue;
    entry.critical = action.critical;
    if (action.hits.some(hasVerifiedHitStructure)) {
      entry.damageInstances = action.hits.map((hit) => ({
        amount: hit.amount,
        kind: hit.kind,
        critical: hit.critical,
        attackCount: hit.attackCount,
        concurrentAttackCount: hit.concurrentAttackCount,
        isRandomAttack: hit.isRandomAttack,
      }));
    }
  }

  const normalEntries = parse.log.filter((entry) => entry.actionKind === 'normal');
  parse.stats.criticalHits = normalEntries.length > 0 && normalEntries.every((entry) => entry.critical !== undefined)
    ? normalEntries.filter((entry) => entry.critical).length
    : undefined;
}

function enrichVerifiedSummonContext(body: Obj, observation: VerifiedCombatObservation): void {
  const context = observation.context;
  if (!context) return;

  const startSummons = verifiedSummonRoster(body.summon, body.supporter);
  if (startSummons.length > 0) context.summons = startSummons;

  const status = obj(body.status) ? body.status : undefined;
  if (status && context.summons?.length) {
    const statusSummons = Array.isArray(status.summon) ? status.summon : undefined;
    if (statusSummons) {
      context.summons = context.summons.map((summon, index) => {
        if (index >= 5) return summon;
        const value = statusSummons[index];
        if (!obj(value)) return summon;
        const cooldown = num(value.recast);
        return cooldown === undefined ? summon : { ...summon, cooldown };
      });
    }

    const supporter = obj(status.supporter) ? status.supporter : undefined;
    const supporterCooldown = supporter ? num(supporter.recast) : undefined;
    if (supporterCooldown !== undefined && context.summons[5]) {
      context.summons[5] = { ...context.summons[5], cooldown: supporterCooldown };
    }
  }

  markObservedSummonUse(body.scenario, context.summons);
}

function verifiedSummonRoster(value: unknown, supporterValue: unknown): CombatSummonContext[] {
  const summons = Array.isArray(value)
    ? value.slice(0, 5).flatMap((entry) => {
        if (!obj(entry)) return [];
        const id = str(entry.id);
        const name = str(entry.name);
        const cooldown = num(entry.recast);
        if (!id && !name) return [];
        return [{ id, name, cooldown, used: false }];
      })
    : [];

  if (summons.length === 5 && obj(supporterValue)) {
    const cooldown = num(supporterValue.recast);
    if (cooldown !== undefined) summons.push({ cooldown, used: false });
  }
  return summons;
}

function markObservedSummonUse(scenario: unknown, summons: CombatSummonContext[] | undefined): void {
  if (!Array.isArray(scenario) || !summons?.length) return;
  for (const raw of scenario) {
    if (!obj(raw) || str(raw.cmd)?.toLowerCase() !== 'summon') continue;
    const name = str(raw.name);
    if (!name) continue;
    const normalizedName = name.toLowerCase();
    let index = summons.findIndex((summon) => summon.name?.trim().toLowerCase() === normalizedName);
    if (
      index < 0 &&
      summons.length === 6 &&
      !summons[5]?.name &&
      summons.slice(0, 5).every((summon) => Boolean(summon.name))
    ) {
      index = 5;
    }
    if (index >= 0) summons[index] = { ...summons[index], name: summons[index]?.name ?? name, used: true };
  }
}

function verifiedNormalGroups(scenario: unknown[]): ParsedDamageHit[][] {
  const groups: ParsedDamageHit[][] = [];
  let pending: ParsedDamageHit[] | undefined;
  let pendingPos: number | undefined;

  const flush = () => {
    if (pending?.length) groups.push(pending);
    pending = undefined;
    pendingPos = undefined;
  };

  for (const value of scenario) {
    if (!obj(value)) continue;
    const cmd = str(value.cmd)?.toLowerCase();
    if (cmd !== 'attack' || str(value.from)?.toLowerCase() !== 'player') {
      flush();
      continue;
    }
    const pos = num(value.pos);
    const hits = semanticDamageHits(value.damage);
    if (!hits.length) {
      flush();
      continue;
    }
    if (pending && pendingPos === pos) pending.push(...hits);
    else {
      flush();
      pending = hits;
      pendingPos = pos;
    }
  }
  flush();
  return groups;
}

function semanticDamageHits(value: unknown): ParsedDamageHit[] {
  const out: ParsedDamageHit[] = [];
  collectSemanticDamage(value, out);
  return out;
}

function collectSemanticDamage(value: unknown, out: ParsedDamageHit[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSemanticDamage(item, out);
    return;
  }
  if (!obj(value)) return;
  const amount = num(value.value);
  if (amount !== undefined) {
    out.push({
      amount,
      kind: 'normal',
      critical: bool(value.critical),
      attackCount: num(value.attack_count),
      concurrentAttackCount: num(value.concurrent_attack_count),
      isRandomAttack: bool(value.is_random_attack),
    });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'damage' || key === 'list' || /^\d+$/.test(key)) collectSemanticDamage(child, out);
  }
}

function sameDamageSequence(raw: readonly ParsedDamageHit[], parsed: readonly ParsedDamageHit[]): boolean {
  return raw.length === parsed.length && raw.every((hit, index) => hit.amount === parsed[index]?.amount);
}

function hasVerifiedHitStructure(hit: ParsedDamageHit): boolean {
  return hit.critical !== undefined
    || hit.attackCount !== undefined
    || hit.concurrentAttackCount !== undefined
    || hit.isRandomAttack !== undefined;
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

function bool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
  }
  return undefined;
}
