import { summarizeTrackedDrop } from './aggregate.ts';
import type {
  CombatLogEntry,
  DamageBreakdown,
  NormalizedRaidParse,
  RaidDropPreferences,
  RaidHistoryRecord,
} from './types.ts';

export interface AttackModeSummary {
  count: number;
  damage: number;
}

export interface SkillDamageSummary {
  name: string;
  uses: number;
  damage: number;
}

export interface CharacterCombatAnalysis {
  actorId: string;
  actorName?: string;
  totalDamage: number;
  breakdown: DamageBreakdown;
  single?: AttackModeSummary;
  double?: AttackModeSummary;
  triple?: AttackModeSummary;
  criticalHits?: number;
  criticalDenominator?: number;
  criticalRate?: number;
  skills: SkillDamageSummary[];
  ougiUses: number;
  ougiDamage: number;
}

export interface TurnSummary {
  currentTurn?: number;
  currentTurnDamage?: number;
  previousTurnDamage?: number;
}

export interface GlobalPinnedDrop {
  raidTechnicalId: string;
  raidName?: string;
  itemId: string;
  itemName?: string;
  observedDrops: number;
  eligibleRuns: number;
  quantityReceived: number;
  rate?: number;
  important: boolean;
}

export function buildCharacterAnalyses(raid: NormalizedRaidParse): CharacterCombatAnalysis[] {
  const orderedIds = raid.characterDamage.map((entry) => entry.actorId);
  const seen = new Set(orderedIds);
  for (const entry of raid.log) {
    const id = logActorId(entry);
    if (id && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  return orderedIds.map((actorId) => buildCharacterAnalysis(raid, actorId));
}

export function buildCharacterAnalysis(
  raid: NormalizedRaidParse,
  actorId: string,
): CharacterCombatAnalysis {
  const damageRow = raid.characterDamage.find((entry) => entry.actorId === actorId);
  const entries = raid.log.filter((entry) => logActorId(entry) === actorId);
  const normal = entries.filter((entry) => entry.actionKind === 'normal');
  const skills = new Map<string, SkillDamageSummary>();
  let ougiUses = 0;
  let ougiDamage = 0;

  for (const entry of entries) {
    if (entry.actionKind === 'skill') {
      const name = entry.actionName?.trim() || 'Unnamed skill';
      const current = skills.get(name) ?? { name, uses: 0, damage: 0 };
      current.uses += 1;
      current.damage += categoryDamage(entry, 'skill');
      skills.set(name, current);
    }
    if (entry.actionKind === 'ougi') {
      ougiUses += 1;
      ougiDamage += categoryDamage(entry, 'ougi');
    }
  }

  const single = attackMode(normal, 1);
  const double = attackMode(normal, 2);
  const triple = attackMode(normal, 3);
  const denominatorKnown = normal.length > 0 && normal.every((entry) => entry.multiattack !== undefined);
  const criticalDenominator = denominatorKnown
    ? normal.reduce((sum, entry) => sum + (entry.multiattack ?? 0), 0)
    : undefined;
  const criticalHits = denominatorKnown
    ? normal.reduce((sum, entry) => sum + (entry.criticalHits ?? 0), 0)
    : undefined;

  return {
    actorId,
    actorName: damageRow?.actorName ?? entries.find((entry) => entry.actorName)?.actorName,
    totalDamage: damageRow?.total ?? entries.reduce((sum, entry) => sum + entry.damage, 0),
    breakdown: damageRow?.breakdown ?? mergeEntryBreakdowns(entries),
    single,
    double,
    triple,
    criticalHits,
    criticalDenominator,
    criticalRate: criticalHits !== undefined && criticalDenominator !== undefined && criticalDenominator > 0
      ? criticalHits / criticalDenominator
      : undefined,
    skills: [...skills.values()].sort((a, b) => b.damage - a.damage || a.name.localeCompare(b.name)),
    ougiUses,
    ougiDamage,
  };
}

export function summarizeTurns(raid: NormalizedRaidParse): TurnSummary {
  const logTurns = raid.log
    .map((entry) => entry.turn)
    .filter((turn): turn is number => Number.isInteger(turn) && (turn ?? 0) >= 0);
  const candidates = raid.lastObservedTurn === undefined ? logTurns : [...logTurns, raid.lastObservedTurn];
  if (!candidates.length) return {};
  const currentTurn = Math.max(...candidates);
  const currentEntries = raid.log.filter((entry) => entry.turn === currentTurn);
  const previousEntries = raid.log.filter((entry) => entry.turn === currentTurn - 1);
  return {
    currentTurn,
    currentTurnDamage: currentEntries.length
      ? currentEntries.reduce((sum, entry) => sum + entry.damage, 0)
      : undefined,
    previousTurnDamage: previousEntries.length
      ? previousEntries.reduce((sum, entry) => sum + entry.damage, 0)
      : undefined,
  };
}

export function observedSummonNames(raid: NormalizedRaidParse): string[] {
  const names = new Set<string>();
  for (const entry of raid.log) {
    if (entry.actionKind !== 'summon') continue;
    const name = entry.actionName?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

export function sortRaidHistoryForDisplay(raids: RaidHistoryRecord[]): RaidHistoryRecord[] {
  return [...raids].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return raidTime(b) - raidTime(a);
  });
}

export function buildGlobalPinnedDrops(
  raids: RaidHistoryRecord[],
  preferences: RaidDropPreferences[],
): GlobalPinnedDrop[] {
  const raidNames = new Map<string, string | undefined>();
  for (const raid of raids) {
    if (!raidNames.has(raid.raidTechnicalId)) raidNames.set(raid.raidTechnicalId, raid.raidName);
  }

  const result: GlobalPinnedDrop[] = [];
  for (const preference of preferences) {
    for (const itemId of preference.pinnedItemIds) {
      const summary = summarizeTrackedDrop(raids, preference.raidTechnicalId, itemId);
      result.push({
        raidTechnicalId: preference.raidTechnicalId,
        raidName: raidNames.get(preference.raidTechnicalId),
        itemId,
        itemName: summary.itemName,
        observedDrops: summary.observedDrops,
        eligibleRuns: summary.eligibleRuns,
        quantityReceived: summary.quantityReceived,
        rate: summary.rate,
        important: preference.importantItemIds.includes(itemId),
      });
    }
  }
  return result.sort((a, b) =>
    (a.raidName ?? a.raidTechnicalId).localeCompare(b.raidName ?? b.raidTechnicalId)
      || (a.itemName ?? a.itemId).localeCompare(b.itemName ?? b.itemId));
}

function attackMode(entries: CombatLogEntry[], count: 1 | 2 | 3): AttackModeSummary | undefined {
  const matching = entries.filter((entry) => entry.multiattack === count);
  if (!matching.length) return undefined;
  return {
    count: matching.length,
    damage: matching.reduce((sum, entry) => sum + categoryDamage(entry, 'normal'), 0),
  };
}

function categoryDamage(entry: CombatLogEntry, kind: keyof DamageBreakdown): number {
  return entry.breakdown[kind] ?? (entry.actionKind === kind ? entry.damage : 0);
}

function mergeEntryBreakdowns(entries: CombatLogEntry[]): DamageBreakdown {
  const result: DamageBreakdown = {};
  for (const entry of entries) {
    for (const kind of ['normal', 'skill', 'ougi', 'echo', 'supplemental', 'other'] as const) {
      const value = entry.breakdown[kind];
      if (value !== undefined) result[kind] = (result[kind] ?? 0) + value;
    }
  }
  return result;
}

function logActorId(entry: CombatLogEntry): string | undefined {
  return entry.actorId ?? (entry.actorName ? `name:${entry.actorName}` : undefined);
}

function raidTime(raid: RaidHistoryRecord): number {
  return raid.observedEndedAt ?? raid.lastObservedAt;
}
