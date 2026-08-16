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
  return hits.map((hit) => ({
    ...hit,
    kind: echoPattern && (hit.concurrentAttackCount ?? 0) > 0 ? 'echo' : 'normal',
  }));
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
