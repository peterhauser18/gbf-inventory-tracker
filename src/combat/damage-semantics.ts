import type { ParsedDamageHit } from './types.ts';

export function criticalDecision(hits: readonly ParsedDamageHit[]): boolean | undefined {
  if (hits.length === 0 || hits.some((hit) => hit.critical === undefined)) return undefined;
  const observed = hits.map((hit) => hit.critical as boolean);
  return observed.every((value) => value === observed[0]) ? observed[0] : undefined;
}

export function classifyVerifiedNormalDamage(
  hits: readonly ParsedDamageHit[],
): ParsedDamageHit[] {
  if (!hits.some((hit) => (hit.concurrentAttackCount ?? 0) > 0)) {
    return hits.map((hit) => ({ ...hit, kind: 'normal' }));
  }

  const echoPattern = isVerifiedFlurryEchoPattern(hits);
  // Sanitized live evidence shows complete rectangular concurrent-lane grids are
  // part of GBF's N.A./Counter result bucket. A lone/partial concurrent lane is
  // still ambiguous, so keep it unclassified instead of guessing Normal/Echo.
  const concurrentNormalPattern = !echoPattern && isVerifiedConcurrentNormalPattern(hits);
  return hits.map((hit) => ({
    ...hit,
    kind: (hit.concurrentAttackCount ?? 0) === 0
      ? 'normal'
      : echoPattern
        ? 'echo'
        : concurrentNormalPattern
          ? 'normal'
          : 'other',
  }));
}

function isVerifiedConcurrentNormalPattern(hits: readonly ParsedDamageHit[]): boolean {
  if (hits.length < 4) return false;
  if (hits.some((hit) => hit.attackCount === undefined || hit.concurrentAttackCount === undefined)) return false;

  const grouped = new Map<number, Map<number, number>>();
  for (const hit of hits) {
    const attackCount = hit.attackCount as number;
    const lane = hit.concurrentAttackCount as number;
    const lanes = grouped.get(attackCount) ?? new Map<number, number>();
    lanes.set(lane, (lanes.get(lane) ?? 0) + 1);
    grouped.set(attackCount, lanes);
  }

  const attackCounts = [...grouped.keys()].sort((a, b) => a - b);
  if (attackCounts.some((value, index) => value !== index)) return false;

  let expectedLaneCount: number | undefined;
  let repeatedSingleAttackPattern = false;
  for (const attackCount of attackCounts) {
    const laneCounts = grouped.get(attackCount);
    if (!laneCounts) return false;
    const lanes = [...laneCounts.keys()].sort((a, b) => a - b);
    if (lanes.length < 2 || lanes.some((value, index) => value !== index)) return false;
    if (expectedLaneCount === undefined) expectedLaneCount = lanes.length;
    else if (lanes.length !== expectedLaneCount) return false;

    const multiplicities = lanes.map((lane) => laneCounts.get(lane) ?? 0);
    if (!multiplicities.every((value) => value === multiplicities[0])) return false;
    if ((multiplicities[0] ?? 0) >= 2) repeatedSingleAttackPattern = true;
  }

  const singleAttackWideLanePattern =
    grouped.size === 1 &&
    (expectedLaneCount ?? 0) >= 4 &&
    hits.every((hit) => hit.isRandomAttack !== true);

  return grouped.size >= 2 || repeatedSingleAttackPattern || singleAttackWideLanePattern;
}

function isVerifiedFlurryEchoPattern(hits: readonly ParsedDamageHit[]): boolean {
  if (hits.length < 4 || !hits.every((hit) => hit.isRandomAttack === true)) return false;
  if (hits.some((hit) => hit.attackCount === undefined)) return false;
  const attackCounts = new Set(hits.map((hit) => hit.attackCount as number));
  if (attackCounts.size !== 1) return false;

  const lanes = hits.map((hit) => hit.concurrentAttackCount);
  if (lanes.some((lane) => lane === undefined)) return false;
  const numericLanes = lanes as number[];
  if (numericLanes.length % 2 !== 0 || numericLanes.length < 4) return false;
  for (let index = 0; index < numericLanes.length; index += 1) {
    if (numericLanes[index] !== index % 2) return false;
  }
  return true;
}
