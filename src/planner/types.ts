export interface MaterialRequirement {
  itemId: string;
  name: string;
  quantity: number;
}

export interface UpgradeGoal {
  id: string;
  label: string;
  requirements: MaterialRequirement[];
  prerequisites?: Prerequisite[];
}

export interface Prerequisite {
  id: string;
  label: string;
  satisfied: boolean;
}

export interface MaterialDeficit extends MaterialRequirement {
  owned: number;
  missing: number;
}

export interface GoalCalculation {
  goalId: string;
  complete: boolean;
  materials: MaterialDeficit[];
  unmetPrerequisites: Prerequisite[];
}
