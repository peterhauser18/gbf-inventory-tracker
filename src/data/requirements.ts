import type { MaterialRequirement, UpgradeGoal } from '../planner/types.ts';

const item = (itemId: string, name: string, quantity: number): MaterialRequirement => ({
  id: `treasure:${itemId}`,
  itemId,
  name,
  quantity,
  source: 'treasures',
  wikiTitle: name,
});

const consumable = (
  itemId: string,
  itemKindId: string,
  group: string,
  name: string,
  quantity: number,
): MaterialRequirement => ({
  id: `consumable:${group}:${itemKindId}:${itemId}`,
  itemId,
  itemKindId,
  group,
  name,
  quantity,
  source: 'consumables',
  wikiTitle: name,
});

const untracked = (id: string, name: string, quantity: number, wikiTitle = name): MaterialRequirement => ({
  id,
  name,
  quantity,
  source: 'untracked',
  wikiTitle,
});

const rupies = (quantity = 100_000): MaterialRequirement =>
  untracked('currency:rupies', 'Rupies', quantity, 'Rupie');

const eternal = (
  id: string,
  label: string,
  characterMasterId: string,
  requirements: MaterialRequirement[],
): UpgradeGoal => ({
  id,
  label: `${label} final 5★ character uncap`,
  characterMasterId,
  targetUncap: 5,
  requirements: [...requirements, rupies()],
  prerequisiteNotes: [
    'The Eternal-specific weapon/Fate unlock path is not proven by the current passive snapshot.',
  ],
});

const eternalTranscendenceStage1 = (
  id: string,
  label: string,
  characterMasterId: string,
  silverShard: MaterialRequirement,
  relicName: string,
  elementDrop: MaterialRequirement,
  halos: MaterialRequirement[],
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 1 (Lv110)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 110,
  requirements: [
    GOLD_BRICK(1),
    silverShard,
    untracked(`weapon-relic:${relicName}`, relicName, 30),
    elementDrop,
    ...halos,
    DAMASCUS_CRYSTAL(20),
    rupies(),
  ],
  prerequisiteNotes: [
    'Fourth skill learned: unknown from the current passive snapshot.',
  ],
});

const evoker = (
  id: string,
  label: string,
  characterMasterId: string,
  requirements: MaterialRequirement[],
): UpgradeGoal => ({
  id,
  label: `${label} final 5★ character uncap`,
  characterMasterId,
  targetUncap: 5,
  requirements: [...requirements, rupies()],
  prerequisiteNotes: [
    'All Domain of the Evoker bonuses: unknown from the current snapshot.',
    'Associated New World Foundation weapon at 5★: not mapped as a proven prerequisite yet.',
    'The New World unlock in Zone Mundus: unknown from the current snapshot.',
  ],
});

const evokerTranscendenceStage1 = (
  id: string,
  label: string,
  characterMasterId: string,
  beliefName: string,
  wheelName: string,
  fellcore: MaterialRequirement,
  idean: MaterialRequirement,
  astra: MaterialRequirement,
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 1 (Lv110)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 110,
  requirements: [
    untracked(`belief:${beliefName}`, beliefName, 40),
    untracked(`wheel:${wheelName}`, wheelName, 8),
    untracked('treasure:allotropic-agate', 'Allotropic Agate', 1),
    NEW_WORLD_QUARTZ(20),
    fellcore,
    idean,
    astra,
    rupies(),
  ],
  prerequisiteNotes: [
    'Fourth skill unlocked: unknown from the current passive snapshot.',
    'Two Evoking Solomonis expeditions with the Evoker Party: unknown from the current passive snapshot.',
  ],
});

const INDICUS = (quantity: number) => item('102', 'Indicus Centrum', quantity);
const NIVEUS = (quantity: number) => item('105', 'Niveus Centrum', quantity);
const LUTEUS = (quantity: number) => item('103', 'Luteus Centrum', quantity);
const ATER = (quantity: number) => item('106', 'Ater Centrum', quantity);
const GALBINUS = (quantity: number) => item('104', 'Galbinus Centrum', quantity);
const RUBEUS = (quantity: number) => item('101', 'Rubeus Centrum', quantity);
const WATER_URN = (quantity: number) => item('112', 'Water Urn', quantity);
const LIGHT_URN = (quantity: number) => item('115', 'Light Urn', quantity);
const EARTH_URN = (quantity: number) => item('113', 'Earth Urn', quantity);
const DARK_URN = (quantity: number) => item('116', 'Dark Urn', quantity);
const WIND_URN = (quantity: number) => item('114', 'Wind Urn', quantity);
const FIRE_URN = (quantity: number) => item('111', 'Fire Urn', quantity);
const MURKY = (quantity: number) => item('81', 'Murky Spirits', quantity);
const BRIGHT = (quantity: number) => item('80', 'Bright Spirits', quantity);
const WATER_GRIMOIRE = (quantity: number) => item('20721', 'Water Grimoire', quantity);
const EARTH_GRIMOIRE = (quantity: number) => item('20731', 'Earth Grimoire', quantity);
const WIND_GRIMOIRE = (quantity: number) => item('20741', 'Wind Grimoire', quantity);
const FIRE_GRIMOIRE = (quantity: number) => item('20711', 'Fire Grimoire', quantity);
const RAINBOW_PRISM = (quantity: number) => item('1204', 'Rainbow Prism', quantity);

const GOLD_BRICK = (quantity: number) => consumable('20004', '17', '1', 'Gold Brick', quantity);
const DAMASCUS_CRYSTAL = (quantity: number) => item('203', 'Damascus Crystal', quantity);
const SILVER_SPEAR_SHARD = (quantity: number) => item('5431', 'Silver Spear Shard', quantity);
const SILVER_BOW_SHARD = (quantity: number) => item('5481', 'Silver Bow Shard', quantity);
const SILVER_AXE_SHARD = (quantity: number) => item('5441', 'Silver Axe Shard', quantity);
const SILVER_DAGGER_SHARD = (quantity: number) => item('5421', 'Silver Dagger Shard', quantity);
const SILVER_STAFF_SHARD = (quantity: number) => item('5451', 'Silver Staff Shard', quantity);
const SILVER_GAUNTLET_SHARD = (quantity: number) => item('5471', 'Silver Gauntlet Shard', quantity);
const SILVER_SWORD_SHARD = (quantity: number) => item('5411', 'Silver Sword Shard', quantity);
const SILVER_KATANA_SHARD = (quantity: number) => item('5501', 'Silver Katana Shard', quantity);
const SILVER_HARP_SHARD = (quantity: number) => item('5491', 'Silver Harp Shard', quantity);
const SILVER_GUN_SHARD = (quantity: number) => item('5461', 'Silver Gun Shard', quantity);
const SMOLDERING_RUBBLE = (quantity: number) => item('549', 'Smoldering Rubble', quantity);
const ABYSSAL_TRAGEDY = (quantity: number) => item('550', 'Abyssal Tragedy', quantity);
const INSULAR_CORE = (quantity: number) => item('551', 'Insular Core', quantity);
const GALE_ROCK = (quantity: number) => item('552', 'Gale Rock', quantity);
const THUNDERBOLT_WHEEL = (quantity: number) => item('553', 'Thunderbolt Wheel', quantity);
const TODESSTRIEB = (quantity: number) => item('554', 'Todestrieb', quantity);
const FIRE_HALO = (quantity: number) => item('5211', 'Fire Halo', quantity);
const WATER_HALO = (quantity: number) => item('5221', 'Water Halo', quantity);
const EARTH_HALO = (quantity: number) => item('5231', 'Earth Halo', quantity);
const WIND_HALO = (quantity: number) => item('5241', 'Wind Halo', quantity);

const SEPHIRA_EVOLITE = (quantity: number) => item('25036', 'Sephira Evolite', quantity);
const GOSPEL_ANALIPSIS = (quantity: number) => item('25086', 'Gospel of Analipsis', quantity);
const GOSPEL_EGEIRO = (quantity: number) => item('25085', 'Gospel of Egeiro', quantity);
const GOSPEL_THYSIA = (quantity: number) => item('25087', 'Gospel of Thysia', quantity);
const GOSPEL_GENEA = (quantity: number) => item('25088', 'Gospel of Genea', quantity);
const AQUA_LUSTER = (quantity: number) => item('25071', 'Aqua Luster', quantity);
const TERRA_LUSTER = (quantity: number) => item('25072', 'Terra Luster', quantity);
const IGNIS_LUSTER = (quantity: number) => item('25070', 'Ignis Luster', quantity);
const VENTUS_LUSTER = (quantity: number) => item('25073', 'Ventus Luster', quantity);
const SEPHIRA_STONE = (quantity: number) => item('25000', 'Sephira Stone', quantity);
const NEW_WORLD_QUARTZ = (quantity: number) => item('25074', 'New World Quartz', quantity);
const NIHUYVINTAE_FELLCORE = (quantity: number) => item('628', 'Nihuyvintae Fellcore', quantity);
const JUSTICE_IDEAN = (quantity: number) => item('25007', 'Justice Idean', quantity);
const HANGED_MAN_IDEAN = (quantity: number) => item('25008', 'Hanged Man Idean', quantity);
const AQUABORNE_ASTRA = (quantity: number) => item('25002', 'Aquaborne Astra', quantity);
const EARTHBORNE_ASTRA = (quantity: number) => item('25003', 'Earthborne Astra', quantity);

// 5★ goals model the final character uncap payment. Complex unlock paths remain explicit
// prerequisites until the passive snapshot can prove their account state.
export const upgradeGoals: readonly UpgradeGoal[] = [
  eternal('eternal-anre-5star', 'Anre', '3040030000', [INDICUS(30), WATER_URN(10), MURKY(2), WATER_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-tweyen-5star', 'Tweyen', '3040031000', [NIVEUS(30), LIGHT_URN(10), BRIGHT(2), FIRE_GRIMOIRE(15), WIND_GRIMOIRE(15), RAINBOW_PRISM(100)]),
  eternal('eternal-threo-5star', 'Threo', '3040032000', [LUTEUS(30), EARTH_URN(10), MURKY(2), EARTH_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-feower-5star', 'Feower', '3040033000', [INDICUS(30), WATER_URN(10), MURKY(2), WATER_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-fif-5star', 'Fif', '3040034000', [NIVEUS(30), LIGHT_URN(10), BRIGHT(2), FIRE_GRIMOIRE(15), WIND_GRIMOIRE(15), RAINBOW_PRISM(100)]),
  eternal('eternal-seox-5star', 'Seox', '3040035000', [ATER(30), DARK_URN(10), MURKY(2), WATER_GRIMOIRE(15), EARTH_GRIMOIRE(15), RAINBOW_PRISM(100)]),
  eternal('eternal-seofon-5star', 'Seofon', '3040036000', [GALBINUS(30), WIND_URN(10), BRIGHT(2), WIND_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-eahta-5star', 'Eahta', '3040037000', [LUTEUS(30), EARTH_URN(10), MURKY(2), EARTH_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-niyon-5star', 'Niyon', '3040038000', [GALBINUS(30), WIND_URN(10), BRIGHT(2), WIND_GRIMOIRE(30), RAINBOW_PRISM(100)]),
  eternal('eternal-tien-5star', 'Tien', '3040039000', [RUBEUS(30), FIRE_URN(10), BRIGHT(2), FIRE_GRIMOIRE(30), RAINBOW_PRISM(100)]),

  eternalTranscendenceStage1('eternal-anre-transcendence-1', 'Anre', '3040030000', SILVER_SPEAR_SHARD(200), 'Sapphire Lance Relic', ABYSSAL_TRAGEDY(50), [WATER_HALO(80)]),
  eternalTranscendenceStage1('eternal-tweyen-transcendence-1', 'Tweyen', '3040031000', SILVER_BOW_SHARD(200), 'Pearl Bow Relic', THUNDERBOLT_WHEEL(50), [FIRE_HALO(40), WIND_HALO(40)]),
  eternalTranscendenceStage1('eternal-threo-transcendence-1', 'Threo', '3040032000', SILVER_AXE_SHARD(200), 'Amber Axe Relic', INSULAR_CORE(50), [EARTH_HALO(80)]),
  eternalTranscendenceStage1('eternal-feower-transcendence-1', 'Feower', '3040033000', SILVER_DAGGER_SHARD(200), 'Sapphire Dagger Relic', ABYSSAL_TRAGEDY(50), [WATER_HALO(80)]),
  eternalTranscendenceStage1('eternal-fif-transcendence-1', 'Fif', '3040034000', SILVER_STAFF_SHARD(200), 'Pearl Staff Relic', THUNDERBOLT_WHEEL(50), [FIRE_HALO(40), WIND_HALO(40)]),
  eternalTranscendenceStage1('eternal-seox-transcendence-1', 'Seox', '3040035000', SILVER_GAUNTLET_SHARD(200), 'Onyx Gauntlet Relic', TODESSTRIEB(50), [WATER_HALO(40), EARTH_HALO(40)]),
  eternalTranscendenceStage1('eternal-seofon-transcendence-1', 'Seofon', '3040036000', SILVER_SWORD_SHARD(200), 'Jade Sword Relic', GALE_ROCK(50), [WIND_HALO(80)]),
  eternalTranscendenceStage1('eternal-eahta-transcendence-1', 'Eahta', '3040037000', SILVER_KATANA_SHARD(200), 'Amber Katana Relic', INSULAR_CORE(50), [EARTH_HALO(80)]),
  eternalTranscendenceStage1('eternal-niyon-transcendence-1', 'Niyon', '3040038000', SILVER_HARP_SHARD(200), 'Jade Harp Relic', GALE_ROCK(50), [WIND_HALO(80)]),
  eternalTranscendenceStage1('eternal-tien-transcendence-1', 'Tien', '3040039000', SILVER_GUN_SHARD(200), 'Ruby Gun Relic', SMOLDERING_RUBBLE(50), [FIRE_HALO(80)]),

  evoker('evoker-maria-5star', 'Maria Theresa', '3040160000', [SEPHIRA_EVOLITE(1), GOSPEL_ANALIPSIS(50), AQUA_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-fraux-5star', 'Fraux', '3040161000', [SEPHIRA_EVOLITE(1), GOSPEL_EGEIRO(50), IGNIS_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-geisenborger-5star', 'Geisenborger', '3040162000', [SEPHIRA_EVOLITE(1), GOSPEL_EGEIRO(25), GOSPEL_GENEA(25), IGNIS_LUSTER(25), VENTUS_LUSTER(25), SEPHIRA_STONE(200)]),
  evoker('evoker-estarriola-5star', 'Estarriola', '3040163000', [SEPHIRA_EVOLITE(1), GOSPEL_GENEA(50), VENTUS_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-caim-5star', 'Caim', '3040164000', [SEPHIRA_EVOLITE(1), GOSPEL_THYSIA(50), TERRA_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-lobelia-5star', 'Lobelia', '3040165000', [SEPHIRA_EVOLITE(1), GOSPEL_THYSIA(50), TERRA_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-katzelia-5star', 'Katzelia', '3040166000', [SEPHIRA_EVOLITE(1), GOSPEL_GENEA(50), VENTUS_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-alanaan-5star', 'Alanaan', '3040167000', [SEPHIRA_EVOLITE(1), GOSPEL_EGEIRO(50), IGNIS_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-haaselia-5star', 'Haaselia', '3040168000', [SEPHIRA_EVOLITE(1), GOSPEL_ANALIPSIS(50), AQUA_LUSTER(50), SEPHIRA_STONE(200)]),
  evoker('evoker-nier-5star', 'Nier', '3040169000', [SEPHIRA_EVOLITE(1), GOSPEL_ANALIPSIS(25), GOSPEL_THYSIA(25), AQUA_LUSTER(25), TERRA_LUSTER(25), SEPHIRA_STONE(200)]),

  evokerTranscendenceStage1('evoker-maria-transcendence-1', 'Maria Theresa', '3040160000', 'Belief in Justice', 'Wheel of Aqua', NIHUYVINTAE_FELLCORE(60), JUSTICE_IDEAN(120), AQUABORNE_ASTRA(240)),
  evokerTranscendenceStage1('evoker-caim-transcendence-1', 'Caim', '3040164000', 'Belief in The Hanged Man', 'Wheel of Terra', untracked('fellcore:narophirmidas', 'Narophirmidas Fellcore', 60), HANGED_MAN_IDEAN(120), EARTHBORNE_ASTRA(240)),
] as const;

const GOALS_BY_ID = new Map(upgradeGoals.map((goal) => [goal.id, goal]));
const REQUIREMENT_NAMES_BY_ID = new Map<string, string>();
for (const goal of upgradeGoals) {
  for (const requirement of goal.requirements) {
    if (requirement.itemId) REQUIREMENT_NAMES_BY_ID.set(requirement.itemId, requirement.name);
  }
}

export function findUpgradeGoal(id: string): UpgradeGoal | undefined {
  return GOALS_BY_ID.get(id);
}

export function findRequirementName(itemId: string): string | undefined {
  return REQUIREMENT_NAMES_BY_ID.get(itemId);
}
