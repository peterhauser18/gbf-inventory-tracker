import type { RaidResult } from '../combat/types.ts';

export interface ObservationTargetPolicyState {
  active: boolean;
  tabId?: number;
  tabIds?: readonly number[];
}

export function shouldRetargetObservation(
  state: ObservationTargetPolicyState,
  candidateTabId: number,
): boolean {
  const observedTabIds = state.tabIds?.length
    ? state.tabIds
    : state.tabId === undefined
      ? []
      : [state.tabId];
  return state.active && !observedTabIds.includes(candidateTabId);
}

export function isTerminalResult(result: RaidResult): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}
