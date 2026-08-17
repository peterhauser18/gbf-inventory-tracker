import type { NormalizedRaidParse } from './types.ts';

export interface CombatContextIdentity {
  instanceId?: string;
}

export function combatRaidKey(
  raidTechnicalId: string,
  instanceId: string | undefined,
): string {
  return instanceId ? `instance:${instanceId}` : `raid:${raidTechnicalId}`;
}

export function selectCombatContextKey(
  contexts: Readonly<Record<string, CombatContextIdentity>>,
  currentKey: string | undefined,
  directInstanceId: string | undefined,
  preferredInstanceId?: string | null,
): string | undefined {
  if (directInstanceId) {
    return Object.entries(contexts).find(([, context]) => context.instanceId === directInstanceId)?.[0];
  }
  if (preferredInstanceId === null) return undefined;
  if (preferredInstanceId) {
    return Object.entries(contexts).find(([, context]) => context.instanceId === preferredInstanceId)?.[0];
  }
  return currentKey && contexts[currentKey] ? currentKey : undefined;
}

export function capturedRaidLocalId(raid: NormalizedRaidParse): string {
  if (raid.instanceId) return `capture:${raid.instanceId}`;
  const start = raid.observedStartedAt ?? raid.lastObservedAt;
  return `capture:${raid.raidTechnicalId}:${start}`;
}

export function manualFinalizeRaid(
  raid: NormalizedRaidParse,
  finalizedAt: number,
): NormalizedRaidParse {
  if (isTerminalRaid(raid)) return observedFinalizeRaid(raid);

  return {
    ...raid,
    result: 'unknown',
    resultQuality: 'unknown',
    observedEndedAt: undefined,
    durationMs: undefined,
    finalization: 'manual',
    finalizedAt,
    coverage: {
      ...raid.coverage,
      terminalObserved: false,
    },
  };
}

export function observedFinalizeRaid(raid: NormalizedRaidParse): NormalizedRaidParse {
  if (!isTerminalRaid(raid)) return raid;
  const rewardVictory = hasObservedVictoryRewards(raid) && !isExplicitTerminalResult(raid.result);
  const observedEndedAt = raid.observedEndedAt ?? (rewardVictory ? raid.lastObservedAt : undefined);
  return {
    ...raid,
    result: rewardVictory ? 'victory' : raid.result,
    resultQuality: rewardVictory ? 'known' : raid.resultQuality,
    observedEndedAt,
    durationMs: raid.observedStartedAt !== undefined && observedEndedAt !== undefined
      ? Math.max(0, observedEndedAt - raid.observedStartedAt)
      : raid.durationMs,
    coverage: {
      ...raid.coverage,
      terminalObserved: true,
    },
    finalization: 'observed',
    finalizedAt: observedEndedAt ?? raid.lastObservedAt,
  };
}

export function isTerminalRaid(
  raid: Pick<NormalizedRaidParse, 'result' | 'drops' | 'dropsQuality'>,
): boolean {
  return isExplicitTerminalResult(raid.result) || hasObservedVictoryRewards(raid);
}

function isExplicitTerminalResult(result: NormalizedRaidParse['result']): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}

// The verified result endpoint is only considered victory evidence when it
// produced a complete, non-empty reward list. Known-empty rewards stay
// non-terminal so we do not guess victory for an ambiguous result page.
function hasObservedVictoryRewards(
  raid: Pick<NormalizedRaidParse, 'drops' | 'dropsQuality'>,
): boolean {
  return raid.dropsQuality === 'known' && raid.drops.length > 0;
}
