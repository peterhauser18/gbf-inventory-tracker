export type Element = 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';
export type DataQuality = 'known' | 'partial' | 'unknown';

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

export interface ArtifactInstance {
  id: string;
  masterId: string;
  name?: string;
  level?: number;
  kindId?: string;
  attributeId?: string;
  updatedAt: number;
}

export interface TreasureCount {
  itemId: string;
  name?: string;
  quantity: number;
  updatedAt: number;
}

export interface ConsumableCount {
  itemId: string;
  itemKindId?: string;
  group: string;
  name?: string;
  quantity: number;
  updatedAt: number;
}

export interface ProgressionState {
  key: string;
  value: string | number | boolean;
  updatedAt: number;
}

export interface AccountStatus {
  rank?: number;
  updatedAt: number;
}

export interface SnapshotQuality {
  characters: DataQuality;
  weapons: DataQuality;
  summons: DataQuality;
  artifacts: DataQuality;
  treasures: DataQuality;
  consumables: DataQuality;
  accountStatus: DataQuality;
  progression: DataQuality;
}

export interface AccountSnapshot {
  characters: CharacterInstance[];
  weapons: WeaponInstance[];
  summons: SummonInstance[];
  artifacts: ArtifactInstance[];
  treasures: TreasureCount[];
  consumables: ConsumableCount[];
  progression: ProgressionState[];
  accountStatus?: AccountStatus;
  quality: SnapshotQuality;
  capturedAt: number;
}
