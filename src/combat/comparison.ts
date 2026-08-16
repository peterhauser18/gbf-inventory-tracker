import type { DamageBreakdown, RaidHistoryRecord } from './types.ts';

export type RaidComparisonMetricKey =
  | 'party-damage'
  | 'duration'
  | 'observed-turns'
  | 'damage-per-observed-turn'
  | 'honors'
  | 'normal-damage'
  | 'skill-damage'
  | 'ougi-damage';

export interface RaidComparisonMetric {
  key: RaidComparisonMetricKey;
  label: string;
  left?: number;
  right?: number;
  delta?: number;
  precision?: number;
  unit?: string;
}

export interface ObservedContributor {
  key: string;
  label: string;
}

export interface ContributorComparison {
  quality: 'known' | 'partial' | 'unknown';
  left: ObservedContributor[];
  right: ObservedContributor[];
  common: ObservedContributor[];
  leftOnly: ObservedContributor[];
  rightOnly: ObservedContributor[];
}

export interface RaidHistoryComparison {
  raidTechnicalId: string;
  raidName?: string;
  leftId: string;
  rightId: string;
  metrics: RaidComparisonMetric[];
  contributors: ContributorComparison;
}

export function buildRaidHistoryComparison(
  left: RaidHistoryRecord,
  right: RaidHistoryRecord,
): RaidHistoryComparison | null {
  if (left.raidTechnicalId !== right.raidTechnicalId) return null;

  const leftTurn = observedTurn(left);
  const rightTurn = observedTurn(right);
  const metrics: RaidComparisonMetric[] = [
    metric('party-damage', 'Party damage', knownPartyDamage(left), knownPartyDamage(right)),
    metric('duration', 'Duration', left.durationMs, right.durationMs, 'ms'),
    metric('observed-turns', 'Last observed turn', leftTurn, rightTurn),
    metric(
      'damage-per-observed-turn',
      'Damage / observed turn',
      ratio(knownPartyDamage(left), leftTurn),
      ratio(knownPartyDamage(right), rightTurn),
      undefined,
      1,
    ),
    metric('honors', 'Honors / contribution', honors(left), honors(right)),
    metric('normal-damage', 'Normal damage', knownBreakdown(left, 'normal'), knownBreakdown(right, 'normal')),
    metric('skill-damage', 'Skill damage', knownBreakdown(left, 'skill'), knownBreakdown(right, 'skill')),
    metric('ougi-damage', 'Ougi damage', knownBreakdown(left, 'ougi'), knownBreakdown(right, 'ougi')),
  ];

  return {
    raidTechnicalId: left.raidTechnicalId,
    raidName: left.raidName ?? right.raidName,
    leftId: left.localId,
    rightId: right.localId,
    metrics,
    contributors: compareContributors(left, right),
  };
}

export function observedContributors(raid: RaidHistoryRecord): ObservedContributor[] {
  const result = new Map<string, ObservedContributor>();
  for (const row of raid.characterDamage) {
    const key = row.actorId ? `id:${row.actorId}` : row.actorName ? `name:${normalizeName(row.actorName)}` : '';
    if (!key) continue;
    result.set(key, { key, label: row.actorName ?? row.actorId });
  }
  for (const entry of raid.log) {
    const key = entry.actorId ? `id:${entry.actorId}` : entry.actorName ? `name:${normalizeName(entry.actorName)}` : '';
    if (!key) continue;
    const current = result.get(key);
    result.set(key, { key, label: current?.label ?? entry.actorName ?? entry.actorId ?? 'Unknown contributor' });
  }
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function compareContributors(left: RaidHistoryRecord, right: RaidHistoryRecord): ContributorComparison {
  const leftRows = observedContributors(left);
  const rightRows = observedContributors(right);
  const leftMap = new Map(leftRows.map((row) => [row.key, row]));
  const rightMap = new Map(rightRows.map((row) => [row.key, row]));
  const common = leftRows.filter((row) => rightMap.has(row.key));
  const leftOnly = leftRows.filter((row) => !rightMap.has(row.key));
  const rightOnly = rightRows.filter((row) => !leftMap.has(row.key));
  return {
    quality: combineDamageQuality(left.damageQuality, right.damageQuality),
    left: leftRows,
    right: rightRows,
    common,
    leftOnly,
    rightOnly,
  };
}

function metric(
  key: RaidComparisonMetricKey,
  label: string,
  left: number | undefined,
  right: number | undefined,
  unit?: string,
  precision?: number,
): RaidComparisonMetric {
  return {
    key,
    label,
    left,
    right,
    delta: left !== undefined && right !== undefined ? right - left : undefined,
    unit,
    precision,
  };
}

function knownPartyDamage(raid: RaidHistoryRecord): number | undefined {
  return raid.damageQuality === 'known' ? raid.partyDamage : undefined;
}

function honors(raid: RaidHistoryRecord): number | undefined {
  if (raid.participants?.quality !== 'known') return undefined;
  return raid.participants.honors ?? raid.participants.contribution;
}

function observedTurn(raid: RaidHistoryRecord): number | undefined {
  const turns = raid.log.flatMap((entry) => Number.isInteger(entry.turn) && (entry.turn ?? 0) >= 0 ? [entry.turn!] : []);
  if (raid.lastObservedTurn !== undefined && Number.isInteger(raid.lastObservedTurn) && raid.lastObservedTurn >= 0) {
    turns.push(raid.lastObservedTurn);
  }
  return turns.length ? Math.max(...turns) : undefined;
}

function ratio(value: number | undefined, denominator: number | undefined): number | undefined {
  return value !== undefined && denominator !== undefined && denominator > 0 ? value / denominator : undefined;
}

function knownBreakdown(raid: RaidHistoryRecord, key: keyof DamageBreakdown): number | undefined {
  if (raid.damageQuality !== 'known' || raid.characterDamage.length === 0 || raid.characterDamage.some((row) => row.quality !== 'known')) return undefined;
  return raid.characterDamage.reduce((sum, row) => sum + (row.breakdown[key] ?? 0), 0);
}

function combineDamageQuality(
  left: RaidHistoryRecord['damageQuality'],
  right: RaidHistoryRecord['damageQuality'],
): 'known' | 'partial' | 'unknown' {
  if (left === 'known' && right === 'known') return 'known';
  if (left === 'unknown' && right === 'unknown') return 'unknown';
  return 'partial';
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
