import type { AccountSnapshot, ConsumableCount, TicketCount, TreasureCount } from '../types/account.ts';
import type { GoalCalculation, MaterialDeficit, MaterialRequirement, UpgradeGoal } from './types.ts';

export function calculateGoal(goal: UpgradeGoal, snapshot: AccountSnapshot): GoalCalculation {
  const materials = goal.requirements.map((requirement) => calculateRequirement(requirement, snapshot));
  const knownCount = materials.filter((material) => material.state === 'known').length;
  const observedQuality = knownCount === materials.length ? 'known' : knownCount === 0 ? 'unknown' : 'partial';
  const quality = observedQuality === 'known' && goal.requirements.some((requirement) => requirementFamilyQuality(requirement, snapshot) === 'partial')
    ? 'partial'
    : observedQuality;
  return {
    goalId: goal.id,
    quality,
    complete: quality === 'known' ? materials.every((material) => material.missing === 0) : undefined,
    materials,
  };
}

export function aggregateRequirements(goals: UpgradeGoal[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const goal of goals) {
    for (const requirement of goal.requirements) {
      const key = `${requirement.source}:${requirement.itemId ?? requirement.id}`;
      totals.set(key, (totals.get(key) ?? 0) + requirement.quantity);
    }
  }
  return totals;
}

function calculateRequirement(requirement: MaterialRequirement, snapshot: AccountSnapshot): MaterialDeficit {
  if (requirement.source === 'untracked') {
    return { ...requirement, state: 'unknown' };
  }

  const item = findInventoryItem(requirement, snapshot);
  if (!item) return { ...requirement, state: 'unknown' };

  return {
    ...requirement,
    state: 'known',
    owned: item.quantity,
    missing: Math.max(0, requirement.quantity - item.quantity),
  };
}

function findInventoryItem(
  requirement: MaterialRequirement,
  snapshot: AccountSnapshot,
): TreasureCount | ConsumableCount | TicketCount | undefined {
  switch (requirement.source) {
    case 'treasures': {
      if (requirement.itemId) return snapshot.treasures.find((item) => item.itemId === requirement.itemId);
      const matches = snapshot.treasures.filter((item) => item.name === requirement.name);
      return matches.length === 1 ? matches[0] : undefined;
    }
    case 'consumables':
      return snapshot.consumables.find((item) =>
        item.itemId === requirement.itemId &&
        (requirement.itemKindId === undefined || item.itemKindId === requirement.itemKindId) &&
        (requirement.group === undefined || item.group === requirement.group),
      );
    case 'tickets':
      return snapshot.tickets.find((item) =>
        item.itemId === requirement.itemId &&
        (requirement.itemKindId === undefined || item.itemKindId === requirement.itemKindId) &&
        (requirement.group === undefined || item.group === requirement.group),
      );
    case 'untracked':
      return undefined;
  }
}

function requirementFamilyQuality(requirement: MaterialRequirement, snapshot: AccountSnapshot): 'known' | 'partial' | 'unknown' {
  switch (requirement.source) {
    case 'treasures': return snapshot.quality.treasures;
    case 'consumables': return snapshot.quality.consumables;
    case 'tickets': return snapshot.quality.tickets;
    case 'untracked': return 'unknown';
  }
}
