import type { NormalizedRaidParse } from './types.ts';

export function combatRaidKey(
  raidTechnicalId: string,
  instanceId: string | undefined,
): string {
  return instanceId ? `instance:${instanceId}` : `raid:${raidTechnicalId}`;
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
  if (isTerminalRaid(raid)) {
    return {
      ...raid,
      finalization: raid.finalization ?? 'observed',
      finalizedAt: raid.finalizedAt ?? raid.observedEndedAt ?? finalizedAt,
    };
  }

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
  return {
    ...raid,
    finalization: 'observed',
    finalizedAt: raid.observedEndedAt ?? raid.lastObservedAt,
  };
}

export function isTerminalRaid(raid: Pick<NormalizedRaidParse, 'result'>): boolean {
  return raid.result === 'victory' || raid.result === 'failure' || raid.result === 'left';
}
