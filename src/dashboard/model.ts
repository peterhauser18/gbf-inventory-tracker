import { findRequirementName, findUpgradeGoal } from '../data/requirements.ts';
import { ETERNALS, EVOKERS, findSpecialCharacter, type SpecialCharacterMaster } from '../data/master.ts';
import { calculateGoal } from '../planner/calculate.ts';
import type { GoalCalculation } from '../planner/types.ts';
import type {
  AccountSnapshot,
  CharacterInstance,
  DataQuality,
  WeaponInstance,
} from '../types/account.ts';
import { resolveWikiUrl } from './resolver.ts';

export type DashboardSection =
  | 'overview'
  | 'eternals'
  | 'evokers'
  | 'characters'
  | 'weapons'
  | 'summons'
  | 'treasures'
  | 'consumables'
  | 'stashes';

export interface DetailField {
  label: string;
  value: string;
  state?: DataQuality;
}

export interface DashboardCard {
  key: string;
  kind: 'eternal' | 'evoker' | 'character' | 'weapon' | 'summon' | 'treasure' | 'consumable' | 'ticket' | 'stash';
  title: string;
  subtitle: string;
  quality: DataQuality;
  wikiUrl: string;
  detailFields: DetailField[];
  children?: DashboardCard[];
}

export interface EvidenceRow {
  label: string;
  state: 'known' | 'unknown';
  satisfied?: boolean;
  value?: string;
}

export interface PlannerCard extends DashboardCard {
  kind: 'eternal' | 'evoker';
  masterId: string;
  targetLabel: string;
  targetDisplay: string;
  targetReached?: boolean;
  materialPlan: GoalCalculation;
  prerequisiteEvidence: EvidenceRow[];
  notes: string[];
}

export interface DashboardViewModel {
  capturedAt: number;
  quality: AccountSnapshot['quality'];
  stats: Array<{ label: string; count: number; quality: DataQuality }>;
  eternals: PlannerCard[];
  evokers: PlannerCard[];
  characters: DashboardCard[];
  weapons: DashboardCard[];
  summons: DashboardCard[];
  treasures: DashboardCard[];
  consumables: DashboardCard[];
  tickets: DashboardCard[];
  stashes: DashboardCard[];
}

export function buildDashboardViewModel(snapshot: AccountSnapshot): DashboardViewModel {
  return {
    capturedAt: snapshot.capturedAt,
    quality: snapshot.quality,
    stats: [
      { label: 'Characters', count: snapshot.characters.length, quality: snapshot.quality.characters },
      { label: 'Weapons', count: snapshot.weapons.length, quality: snapshot.quality.weapons },
      { label: 'Summons', count: snapshot.summons.length, quality: snapshot.quality.summons },
      { label: 'Treasures', count: snapshot.treasures.length, quality: snapshot.quality.treasures },
      { label: 'Consumables', count: snapshot.consumables.length, quality: snapshot.quality.consumables },
      { label: 'Tickets / others', count: snapshot.tickets.length, quality: snapshot.quality.tickets },
      { label: 'Weapon stashes', count: snapshot.weaponStashes.length, quality: stashSummaryQuality(snapshot) },
    ],
    eternals: ETERNALS.map((master) => buildPlannerCard(master, snapshot)),
    evokers: EVOKERS.map((master) => buildPlannerCard(master, snapshot)),
    characters: snapshot.characters.map((character) => characterCard(character, snapshot.quality.characters)),
    weapons: snapshot.weapons.map((weapon) => weaponCard(weapon, snapshot.quality.weapons)),
    summons: snapshot.summons.map((summon) => {
      const title = `Summon ${summon.masterId}`;
      return {
        key: `summon:${summon.id}`,
        kind: 'summon',
        title,
        subtitle: summaryParts([numberLabel('Lv', summon.level), numberLabel('Uncap', summon.uncap)]),
        quality: snapshot.quality.summons,
        wikiUrl: resolveWikiUrl({ publicId: summon.masterId }),
        detailFields: [
          { label: 'Instance ID', value: summon.id },
          { label: 'Master ID', value: summon.masterId },
          valueField('Level', summon.level),
          valueField('Uncap', summon.uncap),
        ],
      } satisfies DashboardCard;
    }),
    treasures: snapshot.treasures.map((treasure) => {
      const resolvedName = treasure.name ?? findRequirementName(treasure.itemId);
      return {
        key: `treasure:${treasure.itemId}`,
        kind: 'treasure',
        title: resolvedName ?? `Treasure ${treasure.itemId}`,
        subtitle: `Owned ${formatNumber(treasure.quantity)}`,
        quality: 'known',
        wikiUrl: resolveWikiUrl({
          wikiTitle: findRequirementName(treasure.itemId),
          displayName: resolvedName,
          publicId: treasure.itemId,
        }),
        detailFields: [
          { label: 'Item ID', value: treasure.itemId },
          { label: 'Owned', value: formatNumber(treasure.quantity), state: 'known' },
        ],
      } satisfies DashboardCard;
    }),
    consumables: snapshot.consumables.map((item) => ({
      key: `consumable:${item.group}:${item.itemKindId ?? ''}:${item.itemId}`,
      kind: 'consumable',
      title: item.name ?? `Consumable ${item.itemId}`,
      subtitle: `${item.group} · Owned ${formatNumber(item.quantity)}`,
      quality: 'known',
      wikiUrl: resolveWikiUrl({ displayName: item.name, publicId: item.itemId }),
      detailFields: [
        { label: 'Item ID', value: item.itemId },
        { label: 'Item kind', value: item.itemKindId ?? 'unknown', state: item.itemKindId ? 'known' : 'unknown' },
        { label: 'Group', value: item.group },
        { label: 'Owned', value: formatNumber(item.quantity), state: 'known' },
      ],
    })),
    tickets: snapshot.tickets.map((item) => ({
      key: `ticket:${item.group}:${item.itemKindId ?? ''}:${item.itemId}`,
      kind: 'ticket',
      title: item.name ?? `Ticket / other ${item.itemId}`,
      subtitle: `${item.group} · Owned ${formatNumber(item.quantity)}`,
      quality: 'known',
      wikiUrl: resolveWikiUrl({ displayName: item.name, publicId: item.itemId }),
      detailFields: [
        { label: 'Item ID', value: item.itemId },
        { label: 'Item kind', value: item.itemKindId ?? 'unknown', state: item.itemKindId ? 'known' : 'unknown' },
        { label: 'Group', value: item.group },
        { label: 'Owned', value: formatNumber(item.quantity), state: 'known' },
      ],
    })),
    stashes: snapshot.weaponStashes.map((stash) => ({
      key: `stash:${stash.stashId}`,
      kind: 'stash',
      title: 'Weapon Stash',
      subtitle: `${formatNumber(stash.weapons.length)} observed weapons · ${stash.quality}`,
      quality: stash.quality,
      wikiUrl: resolveWikiUrl({ displayName: 'Weapon Stash' }),
      detailFields: [
        { label: 'Stash ID', value: stash.stashId },
        { label: 'Observed weapons', value: formatNumber(stash.weapons.length) },
        { label: 'Coverage', value: stash.quality, state: stash.quality },
      ],
      children: stash.weapons.map((weapon) => stashWeaponCard(weapon, stash.quality, stash.stashId)),
    })),
  };
}

function buildPlannerCard(master: SpecialCharacterMaster, snapshot: AccountSnapshot): PlannerCard {
  const character = snapshot.characters.find((candidate) => candidate.masterId === master.masterId);
  const selectedGoalId = character?.uncap !== undefined && character.uncap >= 5 && master.transcendenceGoalId
    ? master.transcendenceGoalId
    : master.goalId;
  const goal = findUpgradeGoal(selectedGoalId);
  if (!goal) throw new Error(`Missing upgrade goal ${selectedGoalId}`);
  const targetReached = targetState(character, snapshot.quality.characters, goal.targetUncap, goal.targetLevel);
  const ownership = ownershipEvidence(character, snapshot.quality.characters);
  const prerequisiteEvidence = goal.targetLevel === 110
    ? transcendenceStage1Evidence(master.kind, character, ownership, snapshot.accountStatus?.rank, goal.prerequisiteNotes)
    : [
        ownership,
        characterThresholdEvidence('At least 4★ uncap', character?.uncap, 4, ownership),
        characterThresholdEvidence('Level 80', character?.level, 80, ownership),
        ...(goal.prerequisiteNotes ?? []).map((label) => ({ label, state: 'unknown' as const })),
      ];

  return {
    key: `${master.kind}:${master.masterId}`,
    kind: master.kind,
    title: master.name,
    subtitle: character
      ? summaryParts([numberLabel('Lv', character.level), numberLabel('Uncap', character.uncap), `Target ${targetDisplay(goal.targetUncap, goal.targetLevel)}`])
      : `Ownership ${ownership.state === 'known' ? 'not observed in complete roster' : 'unknown'} · Target ${targetDisplay(goal.targetUncap, goal.targetLevel)}`,
    quality: character ? 'known' : ownership.state === 'known' ? 'known' : 'unknown',
    wikiUrl: resolveWikiUrl({ wikiTitle: master.wikiTitle }),
    detailFields: [
      { label: 'Master ID', value: master.masterId },
      valueField('Level', character?.level),
      valueField('Uncap', character?.uncap),
      valueField('Awakening', character?.awakeningLevel),
      { label: 'Roster coverage', value: snapshot.quality.characters, state: snapshot.quality.characters },
    ],
    masterId: master.masterId,
    targetLabel: goal.label,
    targetDisplay: targetDisplay(goal.targetUncap, goal.targetLevel),
    targetReached,
    materialPlan: calculateGoal(goal, snapshot),
    prerequisiteEvidence,
    notes: targetReached
      ? [master.transcendenceGoalId
          ? `${targetDisplay(goal.targetUncap, goal.targetLevel)} is already observed; later supported stages are not modeled in this milestone.`
          : '5★ is already observed. No currently supported higher target is mapped for this character.'
        ]
      : [...(goal.prerequisiteNotes ?? [])],
  };
}

function characterCard(character: CharacterInstance, quality: DataQuality): DashboardCard {
  const special = findSpecialCharacter(character.masterId);
  const title = special?.name ?? character.name ?? `Character ${character.masterId}`;
  return {
    key: `character:${character.id}`,
    kind: 'character',
    title,
    subtitle: summaryParts([
      numberLabel('Lv', character.level),
      numberLabel('Uncap', character.uncap),
      numberLabel('Awakening', character.awakeningLevel),
    ]),
    quality,
    wikiUrl: resolveWikiUrl({ wikiTitle: special?.wikiTitle, displayName: character.name, publicId: character.masterId }),
    detailFields: [
      { label: 'Instance ID', value: character.id },
      { label: 'Master ID', value: character.masterId },
      valueField('Level', character.level),
      valueField('Uncap', character.uncap),
      valueField('Awakening', character.awakeningLevel),
    ],
  };
}

function weaponCard(weapon: WeaponInstance, quality: DataQuality): DashboardCard {
  return {
    key: `weapon:${weapon.id}`,
    kind: 'weapon',
    title: weapon.name ?? `Weapon ${weapon.masterId}`,
    subtitle: summaryParts([
      numberLabel('Lv', weapon.level),
      numberLabel('Skill', weapon.skillLevel),
      numberLabel('Uncap', weapon.uncap),
    ]),
    quality,
    wikiUrl: resolveWikiUrl({ displayName: weapon.name, publicId: weapon.masterId }),
    detailFields: [
      { label: 'Instance ID', value: weapon.id },
      { label: 'Master ID', value: weapon.masterId },
      valueField('Level', weapon.level),
      valueField('Skill level', weapon.skillLevel),
      valueField('Uncap', weapon.uncap),
      valueField('Awakening', weapon.awakeningLevel),
    ],
  };
}


function stashWeaponCard(weapon: WeaponInstance, quality: DataQuality, stashId: string): DashboardCard {
  const card = weaponCard(weapon, quality);
  return {
    ...card,
    key: `stash-weapon:${stashId}:${weapon.id}`,
    detailFields: [
      { label: 'Stash ID', value: stashId },
      ...card.detailFields,
    ],
  };
}

function ownershipEvidence(character: CharacterInstance | undefined, familyQuality: DataQuality): EvidenceRow {
  if (character) return { label: 'Character recruited', state: 'known', satisfied: true, value: 'observed' };
  if (familyQuality === 'known') return { label: 'Character recruited', state: 'known', satisfied: false, value: 'not observed' };
  return { label: 'Character recruited', state: 'unknown', value: `${familyQuality} roster coverage` };
}

function characterThresholdEvidence(
  label: string,
  value: number | undefined,
  minimum: number,
  ownership: EvidenceRow,
): EvidenceRow {
  if (value !== undefined) return { label, state: 'known', satisfied: value >= minimum, value: String(value) };
  if (ownership.state === 'known' && ownership.satisfied === false) {
    return { label, state: 'known', satisfied: false, value: 'character not observed' };
  }
  return { label, state: 'unknown' };
}

function targetState(
  character: CharacterInstance | undefined,
  familyQuality: DataQuality,
  targetUncap: number,
  targetLevel?: number,
): boolean | undefined {
  if (targetLevel !== undefined && character?.level !== undefined) return character.level >= targetLevel;
  if (character?.uncap !== undefined) return character.uncap >= targetUncap;
  if (!character && familyQuality === 'known') return false;
  return undefined;
}

function transcendenceStage1Evidence(
  kind: 'eternal' | 'evoker',
  character: CharacterInstance | undefined,
  ownership: EvidenceRow,
  rank: number | undefined,
  prerequisiteNotes: string[] | undefined,
): EvidenceRow[] {
  const minimumRank = kind === 'eternal' ? 150 : 200;
  const awakening = kind === 'eternal' ? 7 : 10;
  return [
    ownership,
    characterThresholdEvidence('5★ uncap', character?.uncap, 5, ownership),
    characterThresholdEvidence('Level 100', character?.level, 100, ownership),
    characterThresholdEvidence(`Awakening ${awakening}`, character?.awakeningLevel, awakening, ownership),
    rankEvidence(minimumRank, rank),
    ...(prerequisiteNotes ?? []).map((label) => ({ label, state: 'unknown' as const })),
  ];
}

function rankEvidence(minimum: number, rank: number | undefined): EvidenceRow {
  return rank === undefined
    ? { label: `Player Rank ${minimum}`, state: 'unknown' }
    : { label: `Player Rank ${minimum}`, state: 'known', satisfied: rank >= minimum, value: String(rank) };
}

function targetDisplay(targetUncap: number, targetLevel?: number): string {
  return targetLevel === undefined ? `${targetUncap}★` : `Lv${targetLevel}`;
}

function valueField(label: string, value: number | undefined): DetailField {
  return value === undefined
    ? { label, value: 'unknown', state: 'unknown' }
    : { label, value: String(value), state: 'known' };
}

function numberLabel(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}

function summaryParts(values: Array<string | undefined>): string {
  const parts = values.filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' · ') : 'Details partial / unknown';
}

function stashSummaryQuality(snapshot: AccountSnapshot): DataQuality {
  if (snapshot.weaponStashes.length === 0) return 'unknown';
  if (snapshot.weaponStashes.every((stash) => stash.quality === 'known')) return 'known';
  return 'partial';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
