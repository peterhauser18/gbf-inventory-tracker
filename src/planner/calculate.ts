import type { TreasureCount } from '../types/account';
import type { GoalCalculation, MaterialDeficit, UpgradeGoal } from './types';

export function calculateGoal(goal: UpgradeGoal, inventory: TreasureCount[]): GoalCalculation {
  const ownedById = new Map(inventory.map((item) => [item.itemId, item.quantity]));

  const materials: MaterialDeficit[] = goal.requirements.map((requirement) => {
    const owned = ownedById.get(requirement.itemId) ?? 0;
    return {
      ...requirement,
      owned,
      missing: Math.max(0, requirement.quantity - owned),
    };
  });

  const unmetPrerequisites = (goal.prerequisites ?? []).filter((item) => !item.satisfied);

  return {
    goalId: goal.id,
    complete: materials.every((item) => item.missing === 0) && unmetPrerequisites.length === 0,
    materials,
    unmetPrerequisites,
  };
}

export function aggregateRequirements(goals: UpgradeGoal[]): Map<string, number> {
  const totals = new Map<string, number>();

  for (const goal of goals) {
    for (const requirement of goal.requirements) {
      totals.set(requirement.itemId, (totals.get(requirement.itemId) ?? 0) + requirement.quantity);
    }
  }

  return totals;
}
