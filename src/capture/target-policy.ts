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
  if (state.combatTabId !== undefined && state.combatTabId !== candidateTabId) return false;
  return true;
}

export function combatTargetAfterResult(
  currentCombatTabId: number | undefined,
  sourceTabId: number,
  result: RaidResult,
): number | undefined {
  if (result === 'active') return sourceTabId;
  if (isTerminalResult(result) && currentCombatTabId === sourceTabId) return undefined;
  return currentCombatTabId;
}

export function isTerminalResult(result: RaidResult): boolean {
  return result === 'victory' || result === 'failure' || result === 'left';
}
