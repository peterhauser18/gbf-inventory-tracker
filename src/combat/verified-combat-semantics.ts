import { classifyVerifiedNormalDamage, criticalDecision } from './damage-semantics.ts';
import type { CombatParseContext, CombatSummonContext, VerifiedCombatObservation } from './multiraid.ts';
import type { NormalizedRaidParse, ParsedCombatAction, ParsedDamageHit } from './types.ts';

type Obj = Record<string, unknown>;

export function enrichVerifiedScenarioSemantics(body: unknown, observation: VerifiedCombatObservation): void {
  if (!obj(body)) return;
  enrichVerifiedOwnHonors(observation);
  repairInitialJoinPartyState(body, observation);
  enrichVerifiedSummonContext(body, observation);
  if (!Array.isArray(body.scenario)) return;

  appendVerifiedStartNormalActions(body.scenario, observation);
  unattributeDirectBossAbilityDamage(body.scenario, observation.actions);

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

export function enrichVerifiedOwnHonors(observation: VerifiedCombatObservation): void {
  const context = observation.context;
  const accountName = humanFacingAccountName(context?.accountDisplayName);
  if (!context || !accountName || !context.participants?.length) return;
  const normalized = accountName.toLocaleLowerCase();
  const matches = context.participants.filter((participant) =>
    humanFacingAccountName(participant.name)?.toLocaleLowerCase() === normalized);
  if (matches.length !== 1 || matches[0]?.honors === undefined) return;

  observation.participants = {
    ...observation.participants,
    honors: matches[0].honors,
    quality: observation.participants?.quality === 'known' ? 'known' : 'partial',
  };
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

function repairInitialJoinPartyState(body: Obj, observation: VerifiedCombatObservation): void {
  const context = observation.context;
  const player = obj(body.player) ? body.player : undefined;
  if (
    !context ||
    observation.startObserved ||
    !player ||
    !Array.isArray(player.param) ||
    !Array.isArray(body.scenario)
  ) return;

  const snapshotIds = player.param.map((value) => obj(value) ? str(value.pid) : undefined);
  const promotedInThisResponse = new Set<number>();

  for (const raw of body.scenario) {
    if (!obj(raw) || str(raw.cmd)?.toLowerCase() !== 'die') continue;
    if (str(raw.target, raw.to)?.toLowerCase() !== 'player') continue;
    for (const pos of playerDeathPositions(raw)) {
      const currentId = context.actorSlots[pos]?.id;
      const snapshotId = snapshotIds[pos];
      if (!promotedInThisResponse.has(pos) && (!snapshotId || !currentId || snapshotId !== currentId)) continue;
      if (promoteKnownBackline(context, pos)) promotedInThisResponse.add(pos);
    }
  }
}

function playerDeathPositions(raw: Obj): number[] {
  const positions = new Set<number>();
  const direct = num(raw.pos);
  if (direct !== undefined) positions.add(direct);
  collectPlayerPositions(raw.list, positions);
  return [...positions];
}

function collectPlayerPositions(value: unknown, positions: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlayerPositions(item, positions);
    return;
  }
  if (!obj(value)) return;
  const pos = num(value.pos);
  if (pos !== undefined) positions.add(pos);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'list' || key === 'damage' || /^\d+$/.test(key)) collectPlayerPositions(child, positions);
  }
}

function promoteKnownBackline(context: CombatParseContext, pos: number): boolean {
  if (!Number.isInteger(pos) || pos < 0 || pos >= 4 || pos >= context.actorSlots.length) return false;
  const dead = context.actorSlots[pos];
  const incoming = context.actorSlots[4];
  if (!dead?.id || !incoming?.id) return false;

  rememberContextActor(context, { ...dead, hp: 0, alive: false });
  context.actorSlots[pos] = { ...incoming };
  rememberContextActor(context, incoming);
  context.actorSlots[4] = context.actorSlots[5] ? { ...context.actorSlots[5] } : {};
  context.actorSlots[5] = {};
  return true;
}

function rememberContextActor(context: CombatParseContext, actor: NonNullable<CombatParseContext['actorSlots'][number]>): void {
  if (!actor.id) return;
  context.actors ??= [];
  const index = context.actors.findIndex((entry) => entry.id === actor.id);
  if (index < 0) context.actors.push({ ...actor });
  else context.actors[index] = { ...context.actors[index], ...actor };
}

function appendVerifiedStartNormalActions(
  scenario: unknown[],
  observation: VerifiedCombatObservation,
): void {
  const context = observation.context;
  if (!observation.startObserved || !context || observation.actions.length > 0) return;

  const actions: ParsedCombatAction[] = [];
  let pending: ParsedCombatAction | undefined;
  let pendingPos: number | undefined;

  const flush = () => {
    if (pending) actions.push(pending);
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
    const actor = pos === undefined ? undefined : context.actorSlots[pos];
    const multiattack = num(value.total_attack_num);

    if (pending && pendingPos === pos) {
      pending.hits.push(...hits);
      if (multiattack !== undefined) pending.multiattack = Math.max(pending.multiattack ?? 1, multiattack);
      continue;
    }

    flush();
    pending = {
      observedAt: observation.observedAt,
      turn: context.turn,
      actorId: actor?.id,
      actorName: actor?.id === context.mainCharacterId ? undefined : actor?.name,
      kind: 'normal',
      hits,
      multiattack,
    };
    pendingPos = pos;
  }

  flush();
  if (!actions.length) return;
  observation.actions.push(...actions);
  observation.actionsFieldPresent = true;
}

function unattributeDirectBossAbilityDamage(
  scenario: unknown[],
  actions: ParsedCombatAction[],
): void {
  const signatures = directBossAbilityDamageSignatures(scenario);
  if (!signatures.size) return;

  for (const action of actions) {
    if (action.kind !== 'skill' || !action.name || !action.hits.length) continue;
    const signature = abilityDamageSignature(action.name, action.hits);
    const remaining = signatures.get(signature) ?? 0;
    if (remaining <= 0) continue;

    // Keep this auxiliary boss damage in the raid log/party total, but not in
    // any character row. Sanitized live evidence showed six such 2M effects.
    delete action.actorId;
    delete action.actorName;
    if (remaining === 1) signatures.delete(signature);
    else signatures.set(signature, remaining - 1);
  }
}

function directBossAbilityDamageSignatures(scenario: unknown[]): Map<string, number> {
  const result = new Map<string, number>();

  for (let index = 0; index < scenario.length; index += 1) {
    const value = scenario[index];
    if (
      !obj(value) ||
      str(value.cmd)?.toLowerCase() !== 'ability' ||
      str(value.to)?.toLowerCase() !== 'boss'
    ) continue;

    const name = str(value.name);
    if (!name) continue;
    for (let next = index + 1; next < scenario.length; next += 1) {
      const candidate = scenario[next];
      if (!obj(candidate)) continue;
      const cmd = str(candidate.cmd)?.toLowerCase();
      if (cmd === 'ability' || cmd === 'attack' || cmd === 'special' || cmd === 'summon') break;
      if (
        (cmd === 'damage' || cmd === 'loop_damage') &&
        str(candidate.to)?.toLowerCase() === 'boss'
      ) {
        const hits = semanticDamageHits(candidate.list);
        if (!hits.length) break;
        const signature = abilityDamageSignature(name, hits);
        result.set(signature, (result.get(signature) ?? 0) + 1);
        break;
      }
    }
  }

  return result;
}

function abilityDamageSignature(name: string, hits: readonly ParsedDamageHit[]): string {
  return `${name}\u0000${hits.reduce((sum, hit) => sum + hit.amount, 0)}`;
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
  attributeObservedSummonDamage(observation);
}

function attributeObservedSummonDamage(observation: VerifiedCombatObservation): void {
  const mainCharacterId = observation.context?.mainCharacterId;
  if (!mainCharacterId) return;
  for (const action of observation.actions) {
    if (action.kind !== 'summon' || action.actorId) continue;
    action.actorId = mainCharacterId;
  }
}

function verifiedSummonRoster(value: unknown, supporterValue: unknown): CombatSummonContext[] {
  const hasOwnRoster = Array.isArray(value) && value.length > 0;
  const hasSupporter = obj(supporterValue);
  if (!hasOwnRoster && !hasSupporter) return [];

  const summons: CombatSummonContext[] = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < 5; index += 1) {
      const entry = value[index];
      if (!obj(entry)) {
        summons.push({});
        continue;
      }
      const id = str(entry.id);
      const name = str(entry.name);
      const cooldown = num(entry.recast);
      summons.push(id || name || cooldown !== undefined ? { id, name, cooldown, used: false } : {});
    }
  }
  while (summons.length < 5) summons.push({});

  if (hasSupporter) {
    const id = str(supporterValue.id);
    const name = str(supporterValue.name);
    const cooldown = num(supporterValue.recast);
    summons.push(id || name || cooldown !== undefined ? { id, name, cooldown, used: false } : {});
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

function humanFacingAccountName(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || /^(?:mc|main character)$/i.test(text)) return undefined;
  if (/(?:^|_)sp(?:_|$)/i.test(text) && /\d/.test(text)) return undefined;
  return text;
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
