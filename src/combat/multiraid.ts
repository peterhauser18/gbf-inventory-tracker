import type { CapturedResponseRecord } from '../capture/types.ts';
import { mergeCombatObservation } from './parser.ts';
import type {
  BossState,
  CombatObservation,
  DamageKind,
  NormalizedRaidParse,
  ParsedCombatAction,
  ParsedDamageHit,
  RaidDrop,
  RaidResult,
} from './types.ts';

export interface CombatActorContext {
  id?: string;
  name?: string;
  hp?: number;
  maxHp?: number;
  alive?: boolean;
}

export interface CombatParticipantDisplay {
  name: string;
  placement?: number;
  level?: number;
  honors?: number;
  host?: boolean;
  hpPercent?: number;
  status?: 'active' | 'dead' | 'retired';
}

export interface CombatParseContext {
  raidTechnicalId: string;
  instanceId?: string;
  actorSlots: CombatActorContext[];
  actors?: CombatActorContext[];
  participants?: CombatParticipantDisplay[];
}

export interface VerifiedCombatObservation extends CombatObservation {
  contributionDelta?: number;
  context?: CombatParseContext;
  forceNewRaid?: boolean;
}

type Obj = Record<string, unknown>;
type VerifiedFamily =
  | 'start'
  | 'normal-attack'
  | 'ability'
  | 'summon'
  | 'temporary-item'
  | 'members'
  | 'result';

export function isVerifiedCombatResponseUrl(url: string): boolean {
  return verifiedFamily(url) !== null;
}

export function parseVerifiedMultiraidObservation(
  record: CapturedResponseRecord,
  context?: CombatParseContext,
): VerifiedCombatObservation | null {
  if (!obj(record.body)) return null;
  const family = verifiedFamily(record.meta.url);
  if (!family) return null;
  const body = record.body;
  if (family === 'start') return parseVerifiedStart(body, record.meta.capturedAt, context);
  if (!context) return null;
  if (family === 'result') return parseVerifiedResult(record.meta.url, body, record.meta.capturedAt, context);
  if (family === 'members') return parseVerifiedMembers(body, record.meta.capturedAt, context);
  return parseVerifiedScenario(body, family, record.meta.capturedAt, context);
}

export function mergeVerifiedMultiraidObservation(
  current: NormalizedRaidParse | null,
  observation: VerifiedCombatObservation,
): NormalizedRaidParse {
  const base = observation.forceNewRaid ? null : current;
  let normalized: CombatObservation = observation;

  if (
    observation.boss?.hp !== undefined &&
    observation.boss.maxHp === undefined &&
    base?.boss?.maxHp !== undefined
  ) {
    const maxHp = base.boss.maxHp;
    normalized = {
      ...normalized,
      boss: {
        ...observation.boss,
        maxHp,
        hpPercent: maxHp > 0 ? observation.boss.hp / maxHp * 100 : undefined,
      },
    };
  }

  if (observation.contributionDelta !== undefined) {
    normalized = {
      ...normalized,
      participants: {
        ...observation.participants,
        contribution: (base?.participants?.contribution ?? 0) + observation.contributionDelta,
        quality: 'partial',
      },
    };
  }

  const next = mergeCombatObservation(base, normalized);
  if (observation.contributionDelta !== undefined && next.participants) {
    next.participants.quality = 'partial';
  }
  return next;
}

function parseVerifiedStart(
  body: Obj,
  observedAt: number,
  previous?: CombatParseContext,
): VerifiedCombatObservation | null {
  const raidTechnicalId = str(body.quest_id);
  if (!raidTechnicalId) return null;
  const instanceId = str(body.raid_id);
  const parsedActors = verifiedActorSlots(body);
  const sameRaid =
    previous?.raidTechnicalId === raidTechnicalId &&
    (!instanceId || !previous.instanceId || instanceId === previous.instanceId);
  const actorSlots = parsedActors.length > 0
    ? parsedActors
    : sameRaid
      ? previous?.actorSlots ?? []
      : [];
  const context: CombatParseContext = {
    raidTechnicalId,
    instanceId,
    actorSlots,
    actors: mergeActorHistory(sameRaid ? previous?.actors : undefined, actorSlots),
    participants: sameRaid ? previous?.participants : undefined,
  };
  const bossState = verifiedStartBoss(body);
  const turn = num(body.turn);
  const host = bool(body.is_host);
  return {
    raidTechnicalId,
    raidName: str(body.quest_name) ?? bossState?.name,
    role: host === undefined ? undefined : host ? 'host' : 'joined',
    observedAt,
    startObserved: turn === 1,
    boss: bossState,
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops: [],
    dropsQuality: 'unknown',
    context,
    forceNewRaid: Boolean(previous && !sameRaid),
  };
}

function parseVerifiedScenario(
  body: Obj,
  family: Exclude<VerifiedFamily, 'start' | 'members' | 'result'>,
  observedAt: number,
  context: CombatParseContext,
): VerifiedCombatObservation | null {
  const scenario = Array.isArray(body.scenario) ? body.scenario : [];
  const parsed = family === 'temporary-item'
    ? { actions: [] as ParsedCombatAction[], gaps: 0, context: verifiedScenarioContext(scenario, context) }
    : verifiedScenarioActions(scenario, observedAt, context);
  const bossState = verifiedScenarioBoss(scenario);
  const contributionDelta = verifiedScenarioContribution(scenario);
  const resultState = verifiedScenarioResult(scenario);
  const relevant =
    scenario.length > 0 ||
    Boolean(bossState) ||
    contributionDelta !== undefined ||
    resultState !== undefined;
  if (!relevant) return null;
  return {
    raidTechnicalId: context.raidTechnicalId,
    observedAt,
    startObserved: false,
    result: resultState,
    boss: bossState,
    contributionDelta,
    actions: parsed.actions,
    actionsFieldPresent: scenario.length > 0,
    unparsedActionCount: parsed.gaps,
    drops: [],
    dropsQuality: 'unknown',
    context: parsed.context,
  };
}

function parseVerifiedMembers(
  body: Obj,
  observedAt: number,
  context: CombatParseContext,
): VerifiedCombatObservation | null {
  const members = Array.isArray(body.multi_member_info) ? body.multi_member_info : undefined;
  const display = verifiedParticipantDisplay(body);
  if (!members && display.length === 0) return null;
  const nextContext = cloneContext(context);
  if (display.length > 0) nextContext.participants = display;
  return {
    raidTechnicalId: context.raidTechnicalId,
    observedAt,
    startObserved: false,
    participants: { count: members?.length ?? display.length, quality: 'known' },
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops: [],
    dropsQuality: 'unknown',
    context: nextContext,
  };
}

function parseVerifiedResult(
  url: string,
  body: Obj,
  observedAt: number,
  context: CombatParseContext,
): VerifiedCombatObservation | null {
  const instanceId = verifiedResultInstanceId(url);
  if (context.instanceId && instanceId && context.instanceId !== instanceId) return null;
  const rewardList = at(body, 'option', 'result_data', 'rewards', 'reward_list');
  if (!obj(rewardList)) return null;
  const drops: RaidDrop[] = [];
  for (const [bucket, value] of Object.entries(rewardList)) {
    collectVerifiedRewardBucket(value, bucket, drops);
  }
  return {
    raidTechnicalId: context.raidTechnicalId,
    observedAt,
    startObserved: false,
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops,
    dropsQuality: 'known',
    context,
  };
}

function verifiedScenarioActions(
  scenario: unknown[],
  observedAt: number,
  context: CombatParseContext,
): { actions: ParsedCombatAction[]; gaps: number; context: CombatParseContext } {
  const actions: ParsedCombatAction[] = [];
  const nextContext = cloneContext(context);
  let gaps = 0;
  let pendingNormal: ParsedCombatAction | undefined;
  let pendingNormalPos: number | undefined;
  let pendingAbility: ParsedCombatAction | undefined;

  const flushNormal = () => {
    if (pendingNormal) actions.push(pendingNormal);
    pendingNormal = undefined;
    pendingNormalPos = undefined;
  };
  const flushAbility = () => {
    if (pendingAbility?.hits.length) actions.push(pendingAbility);
    pendingAbility = undefined;
  };

  for (const raw of scenario) {
    if (!obj(raw)) continue;
    applyScenarioPartyState(nextContext, raw);
    const cmd = str(raw.cmd)?.toLowerCase();
    if (!cmd) continue;

    if (cmd === 'attack') {
      flushAbility();
      if (str(raw.from)?.toLowerCase() !== 'player') {
        flushNormal();
        continue;
      }
      const pos = num(raw.pos);
      const actor = actorAt(nextContext, pos);
      const actionHits = verifiedDamageHits(raw.damage, 'normal');
      if (!actionHits.length) {
        if (raw.damage !== undefined) gaps += 1;
        flushNormal();
        continue;
      }
      const multiattack = num(raw.total_attack_num);
      if (pendingNormal && pendingNormalPos === pos) {
        pendingNormal.hits.push(...actionHits);
        if (multiattack !== undefined) {
          pendingNormal.multiattack = Math.max(pendingNormal.multiattack ?? 1, multiattack);
        }
      } else {
        flushNormal();
        pendingNormal = {
          observedAt,
          actorId: actor?.id,
          actorName: actor?.name,
          kind: 'normal',
          hits: actionHits,
          multiattack,
        };
        pendingNormalPos = pos;
      }
      continue;
    }

    flushNormal();

    if (cmd === 'ability') {
      flushAbility();
      const actor = actorAt(nextContext, num(raw.pos));
      if (!actor) continue;
      pendingAbility = {
        observedAt,
        actorId: actor.id,
        actorName: actor.name,
        kind: 'skill',
        name: str(raw.name),
        hits: [],
      };
      continue;
    }

    if (
      (cmd === 'damage' || cmd === 'loop_damage') &&
      str(raw.to)?.toLowerCase() === 'boss'
    ) {
      const kind: DamageKind = pendingAbility ? 'skill' : 'other';
      const actionHits = verifiedDamageHits(raw.list, kind);
      if (!actionHits.length) {
        if (raw.list !== undefined) gaps += 1;
        continue;
      }
      if (pendingAbility) pendingAbility.hits.push(...actionHits);
      else actions.push({ observedAt, kind: 'other', hits: actionHits });
      continue;
    }

    if (cmd === 'special') {
      flushAbility();
      if (str(raw.target)?.toLowerCase() !== 'boss') continue;
      const actionHits = verifiedDamageHits(raw.list, 'ougi');
      if (!actionHits.length) {
        if (raw.list !== undefined) gaps += 1;
        continue;
      }
      const actor = actorAt(nextContext, num(raw.pos));
      actions.push({
        observedAt,
        actorId: actor?.id,
        actorName: actor?.name,
        kind: 'ougi',
        name: str(raw.name),
        hits: actionHits,
      });
      continue;
    }

    if (cmd === 'summon') {
      flushAbility();
      const actionHits = verifiedDamageHits(raw.list, 'other');
      if (actionHits.length) {
        actions.push({ observedAt, kind: 'summon', name: str(raw.name), hits: actionHits });
      }
    }
  }

  flushNormal();
  flushAbility();
  return { actions, gaps, context: nextContext };
}

function verifiedScenarioContext(scenario: unknown[], context: CombatParseContext): CombatParseContext {
  const next = cloneContext(context);
  for (const value of scenario) if (obj(value)) applyScenarioPartyState(next, value);
  return next;
}

function applyScenarioPartyState(context: CombatParseContext, raw: Obj): void {
  const cmd = str(raw.cmd)?.toLowerCase();
  const target = str(raw.to, raw.target)?.toLowerCase();
  if (target === 'player' && (cmd === 'damage' || cmd === 'heal' || cmd === 'super')) {
    collectPlayerHp(raw.list ?? raw.damage, context);
  }
  if (cmd === 'die' && target === 'player') {
    const pos = num(raw.pos);
    if (pos !== undefined) applyExplicitPlayerDeath(context, pos);
  }
}

function collectPlayerHp(value: unknown, context: CombatParseContext): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlayerHp(item, context);
    return;
  }
  if (!obj(value)) return;
  const pos = num(value.pos);
  const hp = num(value.hp);
  if (pos !== undefined && hp !== undefined) updateActorHp(context, pos, hp);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'list' || key === 'damage' || /^\d+$/.test(key)) collectPlayerHp(child, context);
  }
}

function updateActorHp(context: CombatParseContext, pos: number, hp: number): void {
  if (!Number.isInteger(pos) || pos < 0 || pos >= context.actorSlots.length) return;
  const actor = context.actorSlots[pos];
  if (!actor?.id) return;
  const updated = { ...actor, hp };
  context.actorSlots[pos] = updated;
  rememberActor(context, updated);
}

function applyExplicitPlayerDeath(context: CombatParseContext, pos: number): void {
  if (!Number.isInteger(pos) || pos < 0 || pos >= 4 || pos >= context.actorSlots.length) return;
  const dead = context.actorSlots[pos];
  if (!dead?.id) return;
  const deadState = { ...dead, hp: 0, alive: false };
  context.actorSlots[pos] = deadState;
  rememberActor(context, deadState);

  const incoming = context.actorSlots[4];
  if (!incoming?.id) return;
  context.actorSlots[pos] = { ...incoming };
  rememberActor(context, incoming);
  context.actorSlots[4] = context.actorSlots[5] ? { ...context.actorSlots[5] } : {};
  context.actorSlots[5] = {};
}

function cloneContext(context: CombatParseContext): CombatParseContext {
  return {
    raidTechnicalId: context.raidTechnicalId,
    instanceId: context.instanceId,
    actorSlots: context.actorSlots.map((actor) => ({ ...actor })),
    actors: (context.actors ?? context.actorSlots).map((actor) => ({ ...actor })),
    participants: context.participants?.map((participant) => ({ ...participant })),
  };
}

function mergeActorHistory(previous: CombatActorContext[] | undefined, slots: CombatActorContext[]): CombatActorContext[] {
  const result = (previous ?? []).map((actor) => ({ ...actor }));
  for (const actor of slots) mergeActorInto(result, actor);
  return result;
}

function rememberActor(context: CombatParseContext, actor: CombatActorContext): void {
  context.actors ??= [];
  mergeActorInto(context.actors, actor);
}

function mergeActorInto(actors: CombatActorContext[], actor: CombatActorContext): void {
  if (!actor.id) return;
  const index = actors.findIndex((entry) => entry.id === actor.id);
  if (index < 0) actors.push({ ...actor });
  else actors[index] = { ...actors[index], ...actor };
}

function verifiedParticipantDisplay(body: Obj): CombatParticipantDisplay[] {
  const members = Array.isArray(body.multi_member_info) ? body.multi_member_info.filter(obj) : [];
  const ranking = Array.isArray(body.mvp_info) ? body.mvp_info.filter(obj) : [];
  const memberByName = new Map<string, Obj | null>();
  for (const member of members) {
    const name = str(member.nickname, member.name);
    if (!name) continue;
    memberByName.set(name, memberByName.has(name) ? null : member);
  }

  const source = ranking.length > 0 ? ranking : members;
  return source.slice(0, 30).flatMap((value, index) => {
    const name = str(value.nickname, value.name);
    if (!name) return [];
    const member = memberByName.get(name) ?? (ranking.length === 0 ? value : undefined);
    const retired = member ? bool(member.retired_flag, member.retired) : undefined;
    const dead = member ? bool(member.is_dead, member.dead) : undefined;
    const status = retired === true ? 'retired' as const
      : dead === true ? 'dead' as const
        : retired === false || dead === false ? 'active' as const
          : undefined;
    return [{
      name,
      placement: num(value.rank) ?? (ranking.length === 0 ? undefined : index + 1),
      level: num(value.level, member?.level),
      honors: num(value.point, value.honors, value.honour),
      host: member ? bool(member.is_host) : undefined,
      hpPercent: member ? num(member.hp_ratio) : undefined,
      status,
    }];
  });
}

function verifiedDamageHits(value: unknown, kind: DamageKind): ParsedDamageHit[] {
  const out: ParsedDamageHit[] = [];
  collectVerifiedDamage(value, kind, out);
  return out;
}

function collectVerifiedDamage(value: unknown, kind: DamageKind, out: ParsedDamageHit[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectVerifiedDamage(item, kind, out);
    return;
  }
  if (!obj(value)) return;
  const amount = num(value.value);
  if (amount !== undefined) {
    out.push({ amount, kind, critical: bool(value.critical) });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'damage' || key === 'list' || /^\d+$/.test(key)) {
      collectVerifiedDamage(child, kind, out);
    }
  }
}

function verifiedScenarioBoss(scenario: unknown[]): BossState | undefined {
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
      hpPercent: hp !== undefined && maxHp !== undefined && maxHp > 0
        ? hp / maxHp * 100
        : undefined,
      quality: hp !== undefined ? 'known' : 'partial',
    };
  }
  return latest;
}

function verifiedScenarioContribution(scenario: unknown[]): number | undefined {
  let contribution = 0;
  let observed = false;
  for (const value of scenario) {
    if (!obj(value) || str(value.cmd)?.toLowerCase() !== 'contribution') continue;
    const amount = num(value.amount);
    if (amount === undefined) continue;
    contribution += amount;
    observed = true;
  }
  return observed ? contribution : undefined;
}

function verifiedScenarioResult(
  scenario: unknown[],
): Exclude<RaidResult, 'active'> | undefined {
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

function verifiedStartBoss(body: Obj): BossState | undefined {
  const params = at(body, 'boss', 'param');
  if (!Array.isArray(params)) return undefined;
  for (const value of params) {
    if (!obj(value)) continue;
    const hp = num(value.hp);
    const maxHp = num(value.hpmax, value.max_hp);
    const id = str(value.enemy_id);
    const name = localizedText(value.name);
    if (hp === undefined && maxHp === undefined && !id && !name) continue;
    return {
      id,
      name,
      hp,
      maxHp,
      hpPercent: hp !== undefined && maxHp !== undefined && maxHp > 0
        ? hp / maxHp * 100
        : undefined,
      quality: hp !== undefined ? 'known' : 'partial',
    };
  }
  return undefined;
}

function verifiedActorSlots(body: Obj): CombatActorContext[] {
  const params = at(body, 'player', 'param');
  if (!Array.isArray(params)) return [];
  return params.map((value) => obj(value)
    ? {
        id: str(value.pid),
        name: str(value.name),
        hp: num(value.hp),
        maxHp: num(value.hpmax, value.max_hp),
        alive: bool(value.alive),
      }
    : {});
}

function actorAt(
  context: CombatParseContext,
  pos: number | undefined,
): CombatActorContext | undefined {
  if (pos === undefined || !Number.isInteger(pos) || pos < 0) return undefined;
  return context.actorSlots[pos];
}

function collectVerifiedRewardBucket(
  value: unknown,
  bucket: string,
  out: RaidDrop[],
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectVerifiedReward(item, bucket, out);
    return;
  }
  if (!obj(value)) return;
  if (isVerifiedReward(value)) {
    collectVerifiedReward(value, bucket, out);
    return;
  }
  for (const item of Object.values(value)) collectVerifiedReward(item, bucket, out);
}

function collectVerifiedReward(value: unknown, bucket: string, out: RaidDrop[]): void {
  if (!obj(value)) return;
  const id = str(value.id);
  const itemKind = str(value.item_kind);
  const quantity = num(value.count);
  if (!id || quantity === undefined) return;
  out.push({
    itemId: itemKind ? `${itemKind}:${id}` : id,
    name: str(value.name),
    quantity,
    chest: bucket,
  });
}

function isVerifiedReward(value: Obj): boolean {
  return str(value.id) !== undefined && num(value.count) !== undefined;
}

function verifiedResultInstanceId(url: string): string | undefined {
  try {
    return /^\/resultmulti\/content\/index\/([^/]+)\/?$/
      .exec(new URL(url).pathname)?.[1];
  } catch {
    return undefined;
  }
}

function verifiedFamily(url: string): VerifiedFamily | null {
  try {
    const path = new URL(url).pathname;
    if (path === '/rest/multiraid/start.json') return 'start';
    if (path === '/rest/multiraid/normal_attack_result.json') return 'normal-attack';
    if (path === '/rest/multiraid/ability_result.json') return 'ability';
    if (path === '/rest/multiraid/summon_result.json') return 'summon';
    if (path === '/rest/multiraid/temporary_item_result.json') return 'temporary-item';
    if (path === '/rest/multiraid/multi_member_info') return 'members';
    if (/^\/resultmulti\/content\/index\/[^/]+\/?$/.test(path)) return 'result';
    return null;
  } catch {
    return null;
  }
}

function localizedText(value: unknown): string | undefined {
  if (typeof value === 'string') return str(value);
  if (!obj(value)) return undefined;
  return str(value.en, value.ja, ...Object.values(value));
}

function at(source: Obj, ...keys: string[]): unknown {
  let value: unknown = source;
  for (const key of keys) {
    if (!obj(value)) return undefined;
    value = value[key];
  }
  return value;
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
