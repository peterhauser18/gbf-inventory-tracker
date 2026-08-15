import type { DataQuality } from '../types/account.ts';

export type RequirementSource = 'treasures' | 'consumables' | 'tickets' | 'untracked';

export interface MaterialRequirement {
  id: string;
  itemId?: string;
  itemKindId?: string;
  group?: string;
  name: string;
  quantity: number;
  source: RequirementSource;
  wikiTitle?: string;
}

export interface UpgradeGoal {
  id: string;
  label: string;
  characterMasterId: string;
  targetUncap: number;
  targetLevel?: number;
  requirements: MaterialRequirement[];
  prerequisiteNotes?: string[];
}

export interface MaterialDeficit extends MaterialRequirement {
  state: 'known' | 'unknown';
  owned?: number;
  missing?: number;
}

export interface GoalCalculation {
  goalId: string;
  quality: DataQuality;
  complete?: boolean;
  materials: MaterialDeficit[];
}
