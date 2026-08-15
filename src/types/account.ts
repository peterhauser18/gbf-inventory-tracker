export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';

export interface CharacterInstance {
  id: string;
  masterId: string;
  name?: string;
  element?: Element;
  level?: number;
  uncap?: number;
  awakeningLevel?: number;
  updatedAt: number;
}

export interface WeaponInstance {
  id: string;
  masterId: string;
  name?: string;
  element?: Element;
  level?: number;
  skillLevel?: number;
  uncap?: number;
  awakeningLevel?: number;
  updatedAt: number;
}

export interface SummonInstance {
  id: string;
  masterId: string;
  name?: string;
  element?: Element;
  level?: number;
  uncap?: number;
  updatedAt: number;
}

export interface TreasureCount {
  itemId: string;
  name?: string;
  quantity: number;
  updatedAt: number;
}

export interface ProgressionState {
  key: string;
  value: string | number | boolean;
  updatedAt: number;
}

export interface AccountSnapshot {
  characters: CharacterInstance[];
  weapons: WeaponInstance[];
  summons: SummonInstance[];
  treasures: TreasureCount[];
  progression: ProgressionState[];
  capturedAt: number;
}
