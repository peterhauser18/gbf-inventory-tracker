import type { DamageBreakdown, RaidHistoryRecord } from './types.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';

type ComparableRaidHistoryRecord = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

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

export interface RaidComparisonLoadoutSummary {
  quality: RaidLoadoutSnapshot['quality'];
  deckId?: string;
  partyQuality: RaidLoadoutSnapshot['partyQuality'];
  party: string[];
  summonQuality: RaidLoadoutSnapshot['summonQuality'];
  summons: string[];
}

export interface RaidComparisonRunSummary {
  localId: string;
  observedAt: number;
  result: RaidHistoryRecord['result'];
  role?: RaidHistoryRecord['role'];
  source: RaidHistoryRecord['source'];
  loadout?: RaidComparisonLoadoutSummary;
}

export interface RaidHistoryComparison {
  raidTechnicalId: string;
  raidName?: string;
  leftId: string;
  rightId: string;
  runs: {
    left: RaidComparisonRunSummary;
    right: RaidComparisonRunSummary;
  };
  metrics: RaidComparisonMetric[];
  damageQuality: 'known' | 'partial' | 'unknown';
}

export function buildRaidHistoryComparison(
  left: ComparableRaidHistoryRecord,
  right: ComparableRaidHistoryRecord,
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
    runs: {
      left: runSummary(left),
      right: runSummary(right),
    },
    metrics,
    damageQuality: combineDamageQuality(left.damageQuality, right.damageQuality),
  };
}

function runSummary(raid: ComparableRaidHistoryRecord): RaidComparisonRunSummary {
  return {
    localId: raid.localId,
    observedAt: raid.observedEndedAt ?? raid.lastObservedAt,
    result: raid.result,
    role: raid.role,
    source: raid.source,
    loadout: raid.loadout ? loadoutSummary(raid.loadout) : undefined,
  };
}

function loadoutSummary(loadout: RaidLoadoutSnapshot): RaidComparisonLoadoutSummary {
  return {
    quality: loadout.quality,
    deckId: loadout.deckId,
    partyQuality: loadout.partyQuality,
    party: [...loadout.party]
      .sort((left, right) => left.position - right.position)
      .map((member) => member.name ?? member.id ?? `Slot ${member.position + 1}`),
    summonQuality: loadout.summonQuality,
    summons: [...loadout.summons]
      .sort((left, right) => left.position - right.position)
      .map((summon) => `${summon.support ? 'Support: ' : ''}${summon.name ?? summon.id ?? `Slot ${summon.position + 1}`}`),
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
