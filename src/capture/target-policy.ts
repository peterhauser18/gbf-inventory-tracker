import type { RaidResult } from '../combat/types.ts';

export interface ObservationTargetPolicyState {
  active: boolean;
  tabId?: number;
  combatTabId?: number;
}

export function shouldRetargetObservation(
  state: ObservationTargetPolicyState,
  candidateTabId: number,
): boolean {
  if (!state.active || state.tabId === candidateTabId) return false;
  if (state.combatTabId !== undefined) return false;
  return true;
}

export function isTerminalResult(result: RaidResult): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}
