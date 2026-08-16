import type { DataQuality } from '../types/account.ts';

export type RaidResult = 'active' | 'victory' | 'failure' | 'left' | 'unknown';
export type RaidRole = 'host' | 'joined';
export type DamageKind = 'normal' | 'skill' | 'ougi' | 'echo' | 'supplemental' | 'other';
export type CombatActionKind = 'normal' | 'skill' | 'ougi' | 'summon' | 'other';

export interface DamageBreakdown {
  normal?: number;
  skill?: number;
  ougi?: number;
  echo?: number;
  supplemental?: number;
  other?: number;
}

export interface CharacterDamage {
  actorId: string;
  actorName?: string;
  total: number;
  breakdown: DamageBreakdown;
  quality: DataQuality;
}

export interface CombatLogEntry {
  observedAt: number;
  turn?: number;
  actorId?: string;
  actorName?: string;
  actionKind: CombatActionKind;
  actionName?: string;
  damage: number;
  breakdown: DamageBreakdown;
  targetIds?: string[];
  critical?: boolean;
  criticalHits?: number;
  multiattack?: number;
  damageInstances?: ParsedDamageHit[];
}

export interface BossState {
  id?: string;
  name?: string;
  hp?: number;
  maxHp?: number;
  hpPercent?: number;
  quality: DataQuality;
}

export interface ParticipantState {
  count?: number;
  honors?: number;
  contribution?: number;
  quality: DataQuality;
}

export interface CombatStats {
  attackActions?: number;
  multiattacks?: number;
  criticalHits?: number;
  skillsUsed?: number;
  ougisUsed?: number;
  quality: DataQuality;
}

export interface RaidDrop {
  itemId: string;
  name?: string;
  quantity: number;
  chest?: string;
}

export interface CoverageState {
  startObserved: boolean;
  terminalObserved: boolean;
  parseGapObserved: boolean;
}

export interface NormalizedRaidParse {
  schemaVersion: 1;
  raidTechnicalId: string;
  raidName?: string;
  role?: RaidRole;
  observedStartedAt?: number;
  observedEndedAt?: number;
  durationMs?: number;
  lastObservedTurn?: number;
  result: RaidResult;
  resultQuality: DataQuality;
  parserQuality: DataQuality;
  damageQuality: DataQuality;
  partyDamage?: number;
  characterDamage: CharacterDamage[];
  boss?: BossState;
  participants?: ParticipantState;
  stats: CombatStats;
  log: CombatLogEntry[];
  drops: RaidDrop[];
  dropsQuality: DataQuality;
  coverage: CoverageState;
  lastObservedAt: number;
}

export interface RaidHistoryRecord extends NormalizedRaidParse {
  localId: string;
  source: 'captured' | 'imported';
  favorite: boolean;
  note?: string;
}

export interface RaidDropPreferences {
  raidTechnicalId: string;
  pinnedItemIds: string[];
  importantItemIds: string[];
  updatedAt: number;
}

export interface ParsedDamageHit {
  amount: number;
  kind: DamageKind;
  targetId?: string;
  critical?: boolean;
  attackCount?: number;
  concurrentAttackCount?: number;
  isRandomAttack?: boolean;
}

export interface ParsedCombatAction {
  observedAt: number;
  turn?: number;
  actorId?: string;
  actorName?: string;
  kind: CombatActionKind;
  name?: string;
  hits: ParsedDamageHit[];
  critical?: boolean;
  multiattack?: number;
}

export interface CombatObservation {
  raidTechnicalId: string;
  raidName?: string;
  role?: RaidRole;
  observedAt: number;
  observedTurn?: number;
  startObserved: boolean;
  result?: Exclude<RaidResult, 'active'>;
  boss?: BossState;
  participants?: ParticipantState;
  actions: ParsedCombatAction[];
  actionsFieldPresent: boolean;
  unparsedActionCount: number;
  drops: RaidDrop[];
  dropsQuality: DataQuality;
}

export interface DropRateSummary {
  raidTechnicalId: string;
  itemId: string;
  itemName?: string;
  observedDrops: number;
  eligibleRuns: number;
  quantityReceived: number;
  rate?: number;
}

export interface WikiDropReference {
  state: 'precise' | 'qualitative' | 'unavailable';
  ratePercent?: number;
  label?: string;
  chest?: string;
  sampleSize?: number;
  freshness?: string;
  sourceUrl: string;
  limitation?: string;
}
