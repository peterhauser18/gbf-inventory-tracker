import type { RaidResult } from '../combat/types.ts';

export interface ObservationTargetPolicyState {
  active: boolean;
  tabId?: number;
}

export function shouldRetargetObservation(
  state: ObservationTargetPolicyState,
  candidateTabId: number,
): boolean {
  return state.active && state.tabId !== candidateTabId;
}

export function isTerminalResult(result: RaidResult): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}
