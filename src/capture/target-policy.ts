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
  // An active fight blocks other tabs, but the same locked fight tab must be
  // allowed to reattach after Edge moves/detaches it between windows.
  if (state.combatTabId !== undefined && state.combatTabId !== candidateTabId) return false;
  return true;
}

export function isTerminalResult(result: RaidResult): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}
