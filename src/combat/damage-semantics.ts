import type { ParsedDamageHit } from './types.ts';

export function criticalDecision(hits: readonly ParsedDamageHit[]): boolean | undefined {
  const observed = hits
    .map((hit) => hit.critical)
    .filter((value): value is boolean => value !== undefined);
  if (observed.length === 0) return undefined;
  return observed.every((value) => value === observed[0]) ? observed[0] : undefined;
}

export function classifyVerifiedNormalDamage(
  hits: readonly ParsedDamageHit[],
): ParsedDamageHit[] {
  if (!hits.some((hit) => (hit.concurrentAttackCount ?? 0) > 0)) {
    return hits.map((hit) => ({ ...hit, kind: 'normal' }));
  }

  const echoPattern = isVerifiedFlurryEchoPattern(hits);
  return hits.map((hit) => ({
    ...hit,
    kind: (hit.concurrentAttackCount ?? 0) === 0
      ? 'normal'
      : echoPattern
        ? 'echo'
        : 'other',
  }));
}

function isVerifiedFlurryEchoPattern(hits: readonly ParsedDamageHit[]): boolean {
  if (hits.length < 4 || !hits.every((hit) => hit.isRandomAttack === true)) return false;
  const attackCounts = new Set(hits.map((hit) => hit.attackCount).filter((value) => value !== undefined));
  if (attackCounts.size > 1) return false;

  const lanes = hits.map((hit) => hit.concurrentAttackCount);
  if (lanes.some((lane) => lane === undefined)) return false;
  const numericLanes = lanes as number[];
  if (numericLanes.length % 2 !== 0 || numericLanes.length < 4) return false;
  for (let index = 0; index < numericLanes.length; index += 1) {
    if (numericLanes[index] !== index % 2) return false;
  }
  return true;
}
