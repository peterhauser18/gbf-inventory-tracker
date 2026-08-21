import { findRequirementName, findUpgradeGoal } from '../data/requirements.ts';
import { ETERNALS, EVOKERS, findSpecialCharacter, type SpecialCharacterMaster } from '../data/master.ts';
import { calculateGoal } from '../planner/calculate.ts';
import type { GoalCalculation, UpgradeGoal } from '../planner/types.ts';
import type {
  AccountSnapshot,
  CharacterInstance,
  DataQuality,
  WeaponInstance,
} from '../types/account.ts';
import { resolveWikiUrl } from './resolver.ts';
import {
  EMPTY_ENTITY_METADATA,
  type EntityMetadata,
  type EntityMetadataIndex,
  wikiEntityImageUrl,
} from './wiki-metadata.ts';

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
  imageUrl?: string;
  detailFields: DetailField[];
  children?: DashboardCard[];
}

export interface EvidenceRow {
  label: string;
  state: 'known' | 'unknown';
  satisfied?: boolean;
  value?: string;
}

export interface PlannerStep {
  goalId: string;
  targetLabel: string;
  targetDisplay: string;
  targetReached?: boolean;
  materialPlan: GoalCalculation;
  prerequisiteEvidence: EvidenceRow[];
}

export interface PlannerCard extends DashboardCard {
  kind: 'eternal' | 'evoker';
  masterId: string;
  selectedGoalId: string;
  targetLabel: string;
  targetDisplay: string;
  targetReached?: boolean;
  materialPlan: GoalCalculation;
  prerequisiteEvidence: EvidenceRow[];
  steps: PlannerStep[];
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

export function buildDashboardViewModel(
  snapshot: AccountSnapshot,
  metadata: EntityMetadataIndex = EMPTY_ENTITY_METADATA,
): DashboardViewModel {
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
    characters: snapshot.characters.map((character) => characterCard(
      character,
      snapshot.quality.characters,
      metadata.characters.get(character.masterId),
    )),
    weapons: snapshot.weapons.map((weapon) => weaponCard(
      weapon,
      snapshot.quality.weapons,
      metadata.weapons.get(weapon.masterId),
    )),
    summons: snapshot.summons.map((summon) => {
      const resolved = metadata.summons.get(summon.masterId);
      const title = resolved?.name ?? `Summon ${summon.masterId}`;
      return {
        key: `summon:${summon.id}`,
        kind: 'summon',
        title,
        subtitle: summaryParts([numberLabel('Lv', summon.level), numberLabel('Uncap', summon.uncap)]),
        quality: snapshot.quality.summons,
        wikiUrl: resolveWikiUrl({ wikiTitle: resolved?.wikiTitle, displayName: resolved?.name, publicId: summon.masterId }),
        imageUrl: resolved?.imageUrl ?? wikiEntityImageUrl('summon', summon.masterId),
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
        { label: 'Item kind', value: item.itemKindId ?? 'unavailable', state: item.itemKindId ? 'known' : 'unknown' },
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
        { label: 'Item kind', value: item.itemKindId ?? 'unavailable', state: item.itemKindId ? 'known' : 'unknown' },
        { label: 'Group', value: item.group },
        { label: 'Owned', value: formatNumber(item.quantity), state: 'known' },
      ],
    })),
    stashes: snapshot.weaponStashes.map((stash) => ({
      key: `stash:${stash.stashId}`,
      kind: 'stash',
      title: stash.name ?? `Weapon Stash ${stash.stashId}`,
      subtitle: `${formatNumber(stash.weapons.length)} observed weapons${stash.quality === 'known' ? '' : ` · ${qualityDisplay(stash.quality)}`}`,
      quality: stash.quality,
      wikiUrl: resolveWikiUrl({ displayName: stash.name ?? 'Weapon Stash' }),
      detailFields: [
        { label: 'Stash name', value: stash.name ?? 'unavailable', state: stash.name ? 'known' : 'unknown' },
        { label: 'Stash ID', value: stash.stashId },
        { label: 'Observed weapons', value: formatNumber(stash.weapons.length) },
        { label: 'Coverage', value: qualityDisplay(stash.quality), state: stash.quality },
      ],
      children: stash.weapons.map((weapon) => stashWeaponCard(
        weapon,
        stash.quality,
        stash.stashId,
        stash.name,
        metadata.weapons.get(weapon.masterId),
      )),
    })),
  };
}

function buildPlannerCard(master: SpecialCharacterMaster, snapshot: AccountSnapshot): PlannerCard {
  const character = snapshot.characters.find((candidate) => candidate.masterId === master.masterId);
  const goalIds = [...(master.uncapGoalIds ?? [master.goalId]), ...(master.transcendenceGoalIds ?? [])];
  const steps = goalIds.map((goalId) => {
    const goal = findUpgradeGoal(goalId);
    if (!goal) throw new Error(`Missing upgrade goal ${goalId}`);
    return buildPlannerStep(master, goal, character, snapshot);
  });
  const selected = steps.find((step) => step.targetReached !== true) ?? steps.at(-1);
  if (!selected) throw new Error(`Missing upgrade goals for ${master.masterId}`);
  const ownership = ownershipEvidence(character, snapshot.quality.characters);
  const hasHigherModeledTarget = steps.some((step) => step.goalId !== selected.goalId && step.targetReached !== true);
  const notes = selected.targetReached && !hasHigherModeledTarget
    ? [`${selected.targetDisplay} is already observed. No later verified stage is modeled for this character yet.`]
    : [];

  return {
    key: `${master.kind}:${master.masterId}`,
    kind: master.kind,
    title: master.name,
    subtitle: character
      ? summaryParts([numberLabel('Lv', character.level), numberLabel('Uncap', character.uncap), `Next ${selected.targetDisplay}`])
      : `Ownership ${ownership.state === 'known' ? 'not observed in complete roster' : 'unavailable'} · Next ${selected.targetDisplay}`,
    quality: character ? 'known' : ownership.state === 'known' ? 'known' : 'unknown',
    wikiUrl: resolveWikiUrl({ wikiTitle: master.wikiTitle }),
    imageUrl: wikiEntityImageUrl('character', master.masterId, master.wikiTitle),
    detailFields: [
      { label: 'Master ID', value: master.masterId },
      valueField('Level', character?.level),
      valueField('Uncap', character?.uncap),
      valueField('Awakening', character?.awakeningLevel),
      { label: 'Roster coverage', value: qualityDisplay(snapshot.quality.characters), state: snapshot.quality.characters },
    ],
    masterId: master.masterId,
    selectedGoalId: selected.goalId,
    targetLabel: selected.targetLabel,
    targetDisplay: selected.targetDisplay,
    targetReached: selected.targetReached,
    materialPlan: selected.materialPlan,
    prerequisiteEvidence: selected.prerequisiteEvidence,
    steps,
    notes,
  };
}

function buildPlannerStep(
  master: SpecialCharacterMaster,
  goal: UpgradeGoal,
  character: CharacterInstance | undefined,
  snapshot: AccountSnapshot,
): PlannerStep {
  const ownership = ownershipEvidence(character, snapshot.quality.characters);
  const prerequisiteEvidence = goal.targetLevel !== undefined
    ? transcendenceEvidence(master.kind, goal.targetLevel, character, ownership, snapshot.accountStatus?.rank, goal.prerequisiteNotes)
    : uncapEvidence(goal.targetUncap, character, ownership, goal.prerequisiteNotes);
  return {
    goalId: goal.id,
    targetLabel: goal.label,
    targetDisplay: targetDisplay(goal.targetUncap, goal.targetLevel),
    targetReached: targetState(character, snapshot.quality.characters, goal.targetUncap, goal.targetLevel),
    materialPlan: calculateGoal(goal, snapshot),
    prerequisiteEvidence,
  };
}

function characterCard(
  character: CharacterInstance,
  quality: DataQuality,
  resolved: EntityMetadata | undefined,
): DashboardCard {
  const special = findSpecialCharacter(character.masterId);
  const title = special?.name ?? resolved?.name ?? character.name ?? `Character ${character.masterId}`;
  const wikiTitle = special?.wikiTitle ?? resolved?.wikiTitle;
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
    wikiUrl: resolveWikiUrl({ wikiTitle, displayName: title, publicId: character.masterId }),
    imageUrl: resolved?.imageUrl ?? wikiEntityImageUrl('character', character.masterId, wikiTitle),
    detailFields: [
      { label: 'Instance ID', value: character.id },
      { label: 'Master ID', value: character.masterId },
      valueField('Level', character.level),
      valueField('Uncap', character.uncap),
      valueField('Awakening', character.awakeningLevel),
    ],
  };
}

function weaponCard(
  weapon: WeaponInstance,
  quality: DataQuality,
  resolved?: EntityMetadata,
): DashboardCard {
  const title = resolved?.name ?? weapon.name ?? `Weapon ${weapon.masterId}`;
  return {
    key: `weapon:${weapon.id}`,
    kind: 'weapon',
    title,
    subtitle: summaryParts([
      numberLabel('Lv', weapon.level),
      numberLabel('Skill', weapon.skillLevel),
      numberLabel('Uncap', weapon.uncap),
    ]),
    quality,
    wikiUrl: resolveWikiUrl({ wikiTitle: resolved?.wikiTitle, displayName: title, publicId: weapon.masterId }),
    imageUrl: resolved?.imageUrl ?? wikiEntityImageUrl('weapon', weapon.masterId),
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

function stashWeaponCard(
  weapon: WeaponInstance,
  quality: DataQuality,
  stashId: string,
  stashName: string | undefined,
  resolved?: EntityMetadata,
): DashboardCard {
  const card = weaponCard(weapon, quality, resolved);
  return {
    ...card,
    key: `stash-weapon:${stashId}:${weapon.id}`,
    detailFields: [
      { label: 'Stash', value: stashName ?? stashId },
      { label: 'Stash ID', value: stashId },
      ...card.detailFields,
    ],
  };
}

function ownershipEvidence(character: CharacterInstance | undefined, familyQuality: DataQuality): EvidenceRow {
  if (character) return { label: 'Character recruited', state: 'known', satisfied: true, value: 'observed' };
  if (familyQuality === 'known') return { label: 'Character recruited', state: 'known', satisfied: false, value: 'not observed' };
  return { label: 'Character recruited', state: 'unknown', value: `${qualityDisplay(familyQuality)} roster coverage` };
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
  if (targetLevel !== undefined) {
    if (character?.level !== undefined) return character.level >= targetLevel;
    if (!character && familyQuality === 'known') return false;
    return undefined;
  }
  if (character?.uncap !== undefined) return character.uncap >= targetUncap;
  if (!character && familyQuality === 'known') return false;
  return undefined;
}

function uncapEvidence(
  targetUncap: number,
  character: CharacterInstance | undefined,
  ownership: EvidenceRow,
  prerequisiteNotes: string[] | undefined,
): EvidenceRow[] {
  const evidence: EvidenceRow[] = [ownership];
  if (targetUncap > 1 && targetUncap <= 4) {
    evidence.push(characterThresholdEvidence(`Previous uncap ${targetUncap - 1}★`, character?.uncap, targetUncap - 1, ownership));
  }
  if (targetUncap === 5) {
    evidence.push(
      characterThresholdEvidence('4★ uncap', character?.uncap, 4, ownership),
      characterThresholdEvidence('Level 80', character?.level, 80, ownership),
    );
  }
  evidence.push(...(prerequisiteNotes ?? []).map((label) => ({ label, state: 'unknown' as const })));
  return evidence;
}

function transcendenceEvidence(
  kind: 'eternal' | 'evoker',
  targetLevel: number,
  character: CharacterInstance | undefined,
  ownership: EvidenceRow,
  rank: number | undefined,
  prerequisiteNotes: string[] | undefined,
): EvidenceRow[] {
  if (targetLevel === 110) {
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
  return [
    ownership,
    characterThresholdEvidence(`Level ${targetLevel - 10}`, character?.level, targetLevel - 10, ownership),
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
    ? { label, value: 'unavailable', state: 'unknown' }
    : { label, value: String(value), state: 'known' };
}

function numberLabel(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}

function summaryParts(values: Array<string | undefined>): string {
  const parts = values.filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' · ') : 'Details incomplete';
}

function qualityDisplay(quality: DataQuality): string {
  if (quality === 'known') return 'complete';
  if (quality === 'partial') return 'incomplete';
  return 'unavailable';
}

function stashSummaryQuality(snapshot: AccountSnapshot): DataQuality {
  if (snapshot.weaponStashes.length === 0) return 'unknown';
  if (snapshot.weaponStashes.every((stash) => stash.quality === 'known')) return 'known';
  return 'partial';
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
