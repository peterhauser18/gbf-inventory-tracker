import type { UpgradeGoal } from '../planner/types';

/**
 * Requirement data intentionally starts empty.
 *
 * We will populate this from verified, current sources once the capture and
 * inventory normalization paths are stable. Keeping game requirement data
 * separate from scanner logic makes updates auditable and low-risk.
 */
export const upgradeGoals: UpgradeGoal[] = [];
