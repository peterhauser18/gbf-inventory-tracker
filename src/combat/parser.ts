import type { CapturedResponseRecord } from '../capture/types.ts';
import type {
  BossState, CombatActionKind, CombatLogEntry, CombatObservation, DamageBreakdown, DamageKind,
  NormalizedRaidParse, ParsedCombatAction, ParsedDamageHit, ParticipantState, RaidDrop, RaidResult,
} from './types.ts';

const TERMINAL = new Set<RaidResult>(['victory', 'failure', 'left']);
type Obj = Record<string, unknown>;
type Quality = 'known' | 'partial' | 'unknown';

export function parseCombatObservation(record: CapturedResponseRecord): CombatObservation | null {
  if (!combatPath(record.meta.url) || !obj(record.body)) return null;
  const body = record.body;
  const raidTechnicalId = str(at(body, 'raid', 'technicalId'), at(body, 'raid', 'technical_id'), at(body, 'raid', 'id'), at(body, 'battle', 'raidId'), at(body, 'battle', 'raid_id'), body.raid_id, body.quest_id);
  if (!raidTechnicalId) return null;
  const source = actionSource(body);
  const actions = source.actions.map((value) => action(value, record.meta.capturedAt)).filter(present);
  const dropResult = drops(body);
  const observation: CombatObservation = {
    raidTechnicalId,
    raidName: str(at(body, 'raid', 'name'), at(body, 'battle', 'raidName'), at(body, 'battle', 'name'), body.raid_name, body.quest_name),
    role: role(body), observedAt: record.meta.capturedAt, startObserved: start(body), result: result(body),
    boss: boss(body), participants: participants(body), actions, actionsFieldPresent: source.present,
    unparsedActionCount: source.actions.length - actions.length, drops: dropResult.items, dropsQuality: dropResult.quality,
  };
  return observation.startObserved || observation.result !== undefined || observation.boss || observation.participants || actions.length || observation.dropsQuality !== 'unknown' ? observation : null;
}

export function mergeCombatObservation(current: NormalizedRaidParse | null, observation: CombatObservation): NormalizedRaidParse {
  const base = current && shouldContinueExistingRaid(current, observation)
    ? current
    : emptyRaidParse(observation.raidTechnicalId, observation.observedAt);
  const coverage = {
    startObserved: base.coverage.startObserved || observation.startObserved,
    terminalObserved: base.coverage.terminalObserved || Boolean(observation.result && TERMINAL.has(observation.result)),
    parseGapObserved: base.coverage.parseGapObserved || observation.unparsedActionCount > 0,
  };
  const log = [...base.log, ...observation.actions.map(logEntry)];
  const hasDamage = log.length > 0;
  const damageQuality: Quality = !hasDamage ? 'unknown' : coverage.startObserved && coverage.terminalObserved && !coverage.parseGapObserved ? 'known' : 'partial';
  const observedStartedAt = base.observedStartedAt ?? (observation.startObserved ? observation.observedAt : undefined);
  const observedEndedAt = observation.result && TERMINAL.has(observation.result) ? observation.observedAt : base.observedEndedAt;
  const hasBoss = Boolean(observation.boss ?? base.boss);
  const parserQuality: Quality = coverage.parseGapObserved ? 'partial' : coverage.startObserved && coverage.terminalObserved && (hasDamage || hasBoss) ? 'known' : hasDamage || hasBoss || coverage.startObserved || coverage.terminalObserved ? 'partial' : 'unknown';
  return {
    ...base, raidName: observation.raidName ?? base.raidName, role: observation.role ?? base.role,
    observedStartedAt, observedEndedAt,
    durationMs: observedStartedAt !== undefined && observedEndedAt !== undefined ? Math.max(0, observedEndedAt - observedStartedAt) : undefined,
    result: observation.result ?? (base.result === 'unknown' ? 'active' : base.result),
    resultQuality: observation.result !== undefined ? 'known' : base.resultQuality,
    parserQuality, damageQuality,
    partyDamage: hasDamage ? log.reduce((sum, entry) => sum + entry.damage, 0) : base.partyDamage,
    characterDamage: characterDamage(log, damageQuality), boss: mergeBoss(base.boss, observation.boss),
    participants: mergeParticipants(base.participants, observation.participants), stats: stats(log, damageQuality), log,
    drops: observation.dropsQuality !== 'unknown' ? observation.drops : base.drops,
    dropsQuality: stronger(base.dropsQuality, observation.dropsQuality), coverage, lastObservedAt: observation.observedAt,
  };
}

export function emptyRaidParse(raidTechnicalId: string, observedAt: number): NormalizedRaidParse {
  return { schemaVersion: 1, raidTechnicalId, result: 'active', resultQuality: 'unknown', parserQuality: 'unknown', damageQuality: 'unknown', characterDamage: [], stats: { quality: 'unknown' }, log: [], drops: [], dropsQuality: 'unknown', coverage: { startObserved: false, terminalObserved: false, parseGapObserved: false }, lastObservedAt: observedAt };
}

function shouldContinueExistingRaid(current: NormalizedRaidParse, observation: CombatObservation): boolean {
  if (current.raidTechnicalId !== observation.raidTechnicalId) return false;
  if (!TERMINAL.has(current.result)) return true;
  return !observation.startObserved && observation.actions.length === 0 && observation.dropsQuality !== 'unknown';
}

function combatPath(url: string): boolean { try { return /(?:battle|raid|combat|result|reward)/.test(new URL(url).pathname.toLowerCase()); } catch { return false; } }
function role(body: Obj): 'host' | 'joined' | undefined {
  const value = str(at(body, 'raid', 'role'), body.role)?.toLowerCase();
  if (value === 'host' || value === 'owner') return 'host';
  if (value === 'joined' || value === 'join' || value === 'guest') return 'joined';
  const host = bool(at(body, 'raid', 'isHost'), at(body, 'raid', 'is_host'), body.is_host);
  return host === undefined ? undefined : host ? 'host' : 'joined';
}
function start(body: Obj): boolean { return bool(at(body, 'raid', 'started'), at(body, 'battle', 'started'), at(body, 'combat', 'start'), body.battle_start) === true || str(body.event, at(body, 'combat', 'event'))?.toLowerCase() === 'battle_start'; }
function result(body: Obj): Exclude<RaidResult, 'active'> | undefined {
  const value = str(at(body, 'result', 'status'), at(body, 'raid', 'result'), body.result_status, body.status)?.toLowerCase();
  if (!value) return undefined;
  if (['victory','win','won','success','clear','cleared'].includes(value)) return 'victory';
  if (['failure','fail','failed','defeat','defeated'].includes(value)) return 'failure';
  if (['left','leave','retired','retire','aborted','abort'].includes(value)) return 'left';
  return ['unknown','incomplete'].includes(value) ? 'unknown' : undefined;
}
function boss(body: Obj): BossState | undefined {
  const source = object(body.boss, body.enemy, at(body, 'battle', 'boss'), at(body, 'combat', 'boss'));
  if (!source) return undefined;
  const hp = num(source.hp, source.current_hp, source.currentHp), maxHp = num(source.max_hp, source.maxHp, source.hp_max);
  const id = str(source.id, source.master_id, source.masterId), name = str(source.name);
  if (hp === undefined && maxHp === undefined && !id && !name) return undefined;
  return { id, name, hp, maxHp, hpPercent: hp !== undefined && maxHp !== undefined && maxHp > 0 ? hp / maxHp * 100 : undefined, quality: hp !== undefined ? 'known' : 'partial' };
}
function participants(body: Obj): ParticipantState | undefined {
  const source = object(body.participants, body.participant, at(body, 'raid', 'participants'), body.contribution);
  const count = num(source?.count, source?.participant_count, body.participant_count), honors = num(source?.honors, source?.honour, body.honors, body.honour), contribution = num(source?.contribution, body.contribution_value);
  return count === undefined && honors === undefined && contribution === undefined ? undefined : { count, honors, contribution, quality: 'known' };
}
function actionSource(body: Obj): { present: boolean; actions: unknown[] } {
  for (const candidate of [at(body, 'combat', 'actions'), at(body, 'battle', 'actions'), body.actions]) if (Array.isArray(candidate)) return { present: true, actions: candidate };
  return { present: false, actions: [] };
}
function action(value: unknown, observedAt: number): ParsedCombatAction | null {
  if (!obj(value)) return null;
  const rawKind = str(value.kind, value.type, value.action_type, value.actionType), kind = actionKind(rawKind), actor = object(value.actor, value.character, value.member);
  const actorId = str(actor?.id, actor?.master_id, value.actor_id, value.character_id, value.member_id), actorName = str(actor?.name, value.actor_name, value.character_name);
  const actionHits = hits(value, kind);
  if (!rawKind && !actorId && !actorName && !actionHits.length) return null;
  return { observedAt, turn: num(value.turn, value.turn_number), actorId, actorName, kind, name: str(value.name, value.skill_name, value.ability_name, value.ougi_name), hits: actionHits, multiattack: multiattack(value) };
}
function hits(value: Obj, kind: CombatActionKind): ParsedDamageHit[] {
  const out: ParsedDamageHit[] = [];
  for (const candidate of [value.hits, value.damages]) if (Array.isArray(candidate)) candidate.forEach((hit) => { const parsed = damageHit(hit, kind); if (parsed) out.push(parsed); });
  if (!out.length && typeof value.damage === 'number') out.push({ amount: value.damage, kind: damageKind(undefined, kind) });
  if (!out.length && obj(value.damage)) { const parsed = damageHit(value.damage, kind); if (parsed) out.push(parsed); }
  if (Array.isArray(value.targets)) for (const target of value.targets) {
    if (!obj(target)) continue;
    const targetId = str(target.id, target.target_id, target.targetId);
    if (Array.isArray(target.hits)) target.hits.forEach((hit) => { const parsed = damageHit(hit, kind, targetId); if (parsed) out.push(parsed); });
    else { const parsed = damageHit(target, kind, targetId); if (parsed) out.push(parsed); }
  }
  return out;
}
function damageHit(value: unknown, action: CombatActionKind, inheritedTarget?: string): ParsedDamageHit | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return { amount: value, kind: damageKind(undefined, action), targetId: inheritedTarget };
  if (!obj(value)) return null;
  const amount = num(value.damage, value.amount, value.value); if (amount === undefined) return null;
  const target = object(value.target);
  return { amount, kind: damageKind(str(value.kind, value.type, value.damage_type, value.damageType), action), targetId: str(value.target_id, value.targetId, target?.id) ?? inheritedTarget, critical: bool(value.critical, value.is_critical, value.isCritical) };
}
function multiattack(value: Obj): number | undefined {
  const count = num(value.multiattack, value.attack_count, value.attackCount); if (count !== undefined && count >= 1) return count;
  const raw = str(value.multiattack, value.multi_attack)?.toLowerCase(); return raw === 'double' || raw === 'da' ? 2 : raw === 'triple' || raw === 'ta' ? 3 : undefined;
}
function actionKind(value?: string): CombatActionKind { const raw = value?.toLowerCase() ?? ''; return /^(?:attack|normal|normal_attack)$/.test(raw) ? 'normal' : /(?:skill|ability)/.test(raw) ? 'skill' : /(?:ougi|charge|c\.a\.|ca$)/.test(raw) ? 'ougi' : /summon/.test(raw) ? 'summon' : 'other'; }
function damageKind(value: string | undefined, action: CombatActionKind): DamageKind { const raw = value?.toLowerCase() ?? ''; return /echo/.test(raw) ? 'echo' : /(?:supplement|supplemental|bonus)/.test(raw) ? 'supplemental' : /(?:ougi|charge)/.test(raw) ? 'ougi' : /(?:skill|ability)/.test(raw) ? 'skill' : /(?:normal|attack)/.test(raw) ? 'normal' : action === 'normal' || action === 'skill' || action === 'ougi' ? action : 'other'; }
function drops(body: Obj): { items: RaidDrop[]; quality: Quality } {
  let source: unknown[] | undefined;
  for (const candidate of [at(body, 'result', 'rewards'), at(body, 'result', 'drops'), body.rewards, body.drops]) if (Array.isArray(candidate)) { source = candidate; break; }
  if (!source) return { items: [], quality: 'unknown' };
  const items: RaidDrop[] = []; source.forEach((value) => collectDrop(value, items));
  const complete = bool(at(body, 'result', 'rewardsComplete'), at(body, 'result', 'rewards_complete'), body.reward_complete, body.rewards_complete);
  return { items, quality: complete === true ? 'known' : 'partial' };
}
function collectDrop(value: unknown, out: RaidDrop[], inheritedChest?: string): void {
  if (!obj(value)) return; const chest = str(value.chest, value.chest_type, value.source) ?? inheritedChest;
  const nested = Array.isArray(value.items) ? value.items : Array.isArray(value.rewards) ? value.rewards : undefined;
  if (nested) { nested.forEach((item) => collectDrop(item, out, chest)); return; }
  const itemId = str(value.item_id, value.itemId, value.master_id, value.masterId, value.id), quantity = num(value.quantity, value.count, value.amount);
  if (itemId && quantity !== undefined) out.push({ itemId, name: str(value.name, value.item_name), quantity, chest });
}
function logEntry(action: ParsedCombatAction): CombatLogEntry {
  const breakdown: DamageBreakdown = {}, targets = new Set<string>(); let criticalHits = 0;
  for (const hit of action.hits) { breakdown[hit.kind] = (breakdown[hit.kind] ?? 0) + hit.amount; if (hit.targetId) targets.add(hit.targetId); if (hit.critical) criticalHits += 1; }
  return { observedAt: action.observedAt, turn: action.turn, actorId: action.actorId, actorName: action.actorName, actionKind: action.kind, actionName: action.name, damage: action.hits.reduce((sum, hit) => sum + hit.amount, 0), breakdown, targetIds: targets.size ? [...targets] : undefined, criticalHits: criticalHits || undefined, multiattack: action.multiattack };
}
function characterDamage(log: CombatLogEntry[], quality: Quality) {
  const map = new Map<string, { actorName?: string; total: number; breakdown: DamageBreakdown }>();
  for (const entry of log) { const id = entry.actorId ?? (entry.actorName ? `name:${entry.actorName}` : undefined); if (!id) continue; const row = map.get(id) ?? { actorName: entry.actorName, total: 0, breakdown: {} }; row.total += entry.damage; mergeBreakdown(row.breakdown, entry.breakdown); map.set(id, row); }
  return [...map].map(([actorId, row]) => ({ actorId, ...row, quality }));
}
function stats(log: CombatLogEntry[], quality: Quality) {
  if (!log.length) return { quality };
  let attackActions = 0, multiattacks = 0, criticalHits = 0, skillsUsed = 0, ougisUsed = 0, seenMulti = false, seenCrit = false;
  for (const entry of log) { if (entry.actionKind === 'normal') attackActions++; if (entry.actionKind === 'skill') skillsUsed++; if (entry.actionKind === 'ougi') ougisUsed++; if (entry.multiattack !== undefined) { seenMulti = true; if (entry.multiattack > 1) multiattacks++; } if (entry.criticalHits !== undefined) { seenCrit = true; criticalHits += entry.criticalHits; } }
  return { attackActions, multiattacks: seenMulti ? multiattacks : undefined, criticalHits: seenCrit ? criticalHits : undefined, skillsUsed, ougisUsed, quality };
}
function mergeBoss(a?: BossState, b?: BossState): BossState | undefined { if (!a) return b; if (!b) return a; return { id: b.id ?? a.id, name: b.name ?? a.name, hp: b.hp ?? a.hp, maxHp: b.maxHp ?? a.maxHp, hpPercent: b.hpPercent ?? a.hpPercent, quality: b.quality === 'known' || a.quality === 'known' ? 'known' : 'partial' }; }
function mergeParticipants(a?: ParticipantState, b?: ParticipantState): ParticipantState | undefined { if (!a) return b; if (!b) return a; return { count: b.count ?? a.count, honors: b.honors ?? a.honors, contribution: b.contribution ?? a.contribution, quality: 'known' }; }
function stronger(a: Quality, b: Quality): Quality { return a === 'known' || b === 'known' ? 'known' : a === 'partial' || b === 'partial' ? 'partial' : 'unknown'; }
function mergeBreakdown(target: DamageBreakdown, source: DamageBreakdown): void { for (const key of ['normal','skill','ougi','echo','supplemental','other'] as const) if (source[key] !== undefined) target[key] = (target[key] ?? 0) + (source[key] ?? 0); }
function at(source: Obj, ...keys: string[]): unknown { let value: unknown = source; for (const key of keys) { if (!obj(value)) return undefined; value = value[key]; } return value; }
function obj(value: unknown): value is Obj { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function object(...values: unknown[]): Obj | undefined { return values.find(obj) as Obj | undefined; }
function str(...values: unknown[]): string | undefined { for (const value of values) { if (typeof value === 'string' && value.trim()) return value.trim(); if (typeof value === 'number' && Number.isFinite(value)) return String(value); } return undefined; }
function num(...values: unknown[]): number | undefined { for (const value of values) { if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value; if (typeof value === 'string' && value.trim()) { const parsed = Number(value); if (Number.isFinite(parsed) && parsed >= 0) return parsed; } } return undefined; }
function bool(...values: unknown[]): boolean | undefined { for (const value of values) { if (typeof value === 'boolean') return value; if (value === 1 || value === '1' || value === 'true') return true; if (value === 0 || value === '0' || value === 'false') return false; } return undefined; }
function present<T>(value: T | null): value is T { return value !== null; }