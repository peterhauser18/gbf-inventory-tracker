import type { DataQuality } from '../types/account.ts';
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
  leftQuality: DataQuality;
  rightQuality: DataQuality;
  deltaQuality: DataQuality;
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
  const leftDamage = observedPartyDamage(left);
  const rightDamage = observedPartyDamage(right);
  const metrics: RaidComparisonMetric[] = [
    metric('party-damage', 'Party damage', leftDamage, rightDamage, undefined, undefined, damageMetricQuality(left, leftDamage), damageMetricQuality(right, rightDamage)),
    metric('duration', 'Duration', left.durationMs, right.durationMs, 'ms'),
    metric('observed-turns', 'Last observed turn', leftTurn, rightTurn),
    metric(
      'damage-per-observed-turn',
      'Damage / observed turn',
      ratio(leftDamage, leftTurn),
      ratio(rightDamage, rightTurn),
      undefined,
      1,
      damageMetricQuality(left, leftDamage),
      damageMetricQuality(right, rightDamage),
    ),
    metric('honors', 'Honors / contribution', honors(left), honors(right), undefined, undefined, participantMetricQuality(left), participantMetricQuality(right)),
    damageBreakdownMetric('normal-damage', 'Normal damage', left, right, 'normal'),
    damageBreakdownMetric('skill-damage', 'Skill damage', left, right, 'skill'),
    damageBreakdownMetric('ougi-damage', 'Ougi damage', left, right, 'ougi'),
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
  leftQuality: DataQuality = 'known',
  rightQuality: DataQuality = 'known',
): RaidComparisonMetric {
  const delta = left !== undefined && right !== undefined ? right - left : undefined;
  return {
    key,
    label,
    left,
    right,
    delta,
    unit,
    precision,
    leftQuality: left === undefined ? 'unknown' : leftQuality,
    rightQuality: right === undefined ? 'unknown' : rightQuality,
    deltaQuality: delta === undefined
      ? 'unknown'
      : leftQuality === 'known' && rightQuality === 'known'
        ? 'known'
        : 'partial',
  };
}

function observedPartyDamage(raid: RaidHistoryRecord): number | undefined {
  return raid.partyDamage;
}

function damageMetricQuality(raid: RaidHistoryRecord, value: number | undefined): DataQuality {
  return value === undefined ? 'unknown' : raid.damageQuality;
}

function honors(raid: RaidHistoryRecord): number | undefined {
  return raid.participants?.honors ?? raid.participants?.contribution;
}

function participantMetricQuality(raid: RaidHistoryRecord): DataQuality {
  if (!raid.participants) return 'unknown';
  return raid.participants.quality;
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

function damageBreakdownMetric(
  metricKey: RaidComparisonMetricKey,
  label: string,
  left: RaidHistoryRecord,
  right: RaidHistoryRecord,
  breakdownKey: keyof DamageBreakdown,
): RaidComparisonMetric {
  const leftValue = observedBreakdown(left, breakdownKey);
  const rightValue = observedBreakdown(right, breakdownKey);
  return metric(
    metricKey,
    label,
    leftValue,
    rightValue,
    undefined,
    undefined,
    damageMetricQuality(left, leftValue),
    damageMetricQuality(right, rightValue),
  );
}

function observedBreakdown(raid: RaidHistoryRecord, key: keyof DamageBreakdown): number | undefined {
  let observed = false;
  let total = 0;
  for (const entry of raid.log) {
    const value = entry.breakdown[key];
    if (value === undefined) continue;
    observed = true;
    total += value;
  }
  return observed ? total : undefined;
}

function combineDamageQuality(
  left: RaidHistoryRecord['damageQuality'],
  right: RaidHistoryRecord['damageQuality'],
): 'known' | 'partial' | 'unknown' {
  if (left === 'known' && right === 'known') return 'known';
  if (left === 'unknown' && right === 'unknown') return 'unknown';
  return 'partial';
}
