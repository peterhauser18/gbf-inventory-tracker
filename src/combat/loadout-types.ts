import type { DataQuality } from '../types/account.ts';

export interface RaidLoadoutMember {
  position: number;
  id?: string;
  name?: string;
  frontline: boolean;
}

export interface RaidLoadoutSummon {
  position: number;
  id?: string;
  name?: string;
  support: boolean;
}

export interface RaidLoadoutWeapon {
  slot: number;
  masterId?: string;
  name?: string;
  imageId?: string;
  hp?: number;
  attack?: number;
  plus?: number;
}

export interface RaidLoadoutSignature {
  npcIds: string[];
  summonIds: string[];
  mainWeaponId?: string;
}

export interface RaidWeaponSkillBoost {
  iconId: string;
  label: string;
  value?: string;
  maxed?: boolean;
}

export interface RaidWeaponSkillSnapshot {
  quality: DataQuality;
  estimatedDamage?: number;
  estimatedAdvantageDamage?: number;
  advantageAttribute?: number;
  maxHp?: number;
  enhancement: {
    normal?: number;
    magna?: number;
    other?: number;
  };
  boosts: RaidWeaponSkillBoost[];
}

export interface RaidLoadoutSnapshot {
  quality: DataQuality;
  observedAt: number;
  updatedAt: number;
  correlation: 'battle-start' | 'signature' | 'deck-id';
  deckId?: string;
  signature: RaidLoadoutSignature;
  partyQuality: DataQuality;
  party: RaidLoadoutMember[];
  summonQuality: DataQuality;
  summons: RaidLoadoutSummon[];
  mainWeaponId?: string;
  auxiliaryWeaponId?: string;
  jobId?: string;
  jobName?: string;
  weaponGridQuality: DataQuality;
  weapons: RaidLoadoutWeapon[];
  additionalWeaponsActive?: boolean;
  calculator: RaidWeaponSkillSnapshot;
}
