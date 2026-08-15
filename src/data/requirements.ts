import type { MaterialRequirement, UpgradeGoal } from '../planner/types.ts';

const item = (itemId: string, name: string, quantity: number): MaterialRequirement => ({
  id: `treasure:${itemId}`,
  itemId,
  name,
  quantity,
  source: 'treasures',
  wikiTitle: name,
});

const namedItem = (name: string, quantity: number): MaterialRequirement => ({
  id: `treasure-name:${name}`,
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


interface SsrUncapElement {
  orb: string;
  scroll: string;
  scale: string;
  whorl: string;
  anima: string;
  omegaAnima: string;
}

const SSR_UNCAP: Record<'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark', SsrUncapElement> = {
  fire: { orb: 'Inferno Orb', scroll: 'Hellfire Scroll', scale: 'Red Dragon Scale', whorl: 'Infernal Whorl', anima: 'Colossus Anima', omegaAnima: 'Colossus Omega Anima' },
  water: { orb: 'Frost Orb', scroll: 'Flood Scroll', scale: 'Blue Dragon Scale', whorl: 'Tidal Whorl', anima: 'Leviathan Anima', omegaAnima: 'Leviathan Omega Anima' },
  earth: { orb: 'Rumbling Orb', scroll: 'Thunder Scroll', scale: 'Brown Dragon Scale', whorl: 'Seismic Whorl', anima: 'Yggdrasil Anima', omegaAnima: 'Yggdrasil Omega Anima' },
  wind: { orb: 'Cyclone Orb', scroll: 'Gale Scroll', scale: 'Green Dragon Scale', whorl: 'Tempest Whorl', anima: 'Tiamat Anima', omegaAnima: 'Tiamat Omega Anima' },
  light: { orb: 'Shining Orb', scroll: 'Skylight Scroll', scale: 'White Dragon Scale', whorl: 'Radiant Whorl', anima: 'Luminiera Anima', omegaAnima: 'Luminiera Omega Anima' },
  dark: { orb: 'Abysm Orb', scroll: 'Chasm Scroll', scale: 'Black Dragon Scale', whorl: 'Umbral Whorl', anima: 'Celeste Anima', omegaAnima: 'Celeste Omega Anima' },
};

type ElementKey = keyof typeof SSR_UNCAP;

const standardSsrUncap = (
  idPrefix: string,
  label: string,
  characterMasterId: string,
  element: ElementKey,
  fourStarAnima: string,
  fourStarUnique: string,
): UpgradeGoal[] => {
  const data = SSR_UNCAP[element];
  return [
    {
      id: `${idPrefix}-1star`,
      label: `${label} Uncap 1★`,
      characterMasterId,
      targetUncap: 1,
      requirements: [namedItem(data.orb, 1), namedItem(data.scroll, 2), namedItem('Flawless Prism', 1), rupies(1_000)],
    },
    {
      id: `${idPrefix}-2star`,
      label: `${label} Uncap 2★`,
      characterMasterId,
      targetUncap: 2,
      requirements: [namedItem(data.orb, 1), namedItem(data.scale, 1), namedItem(data.whorl, 1), namedItem('Flawless Prism', 3), namedItem(data.anima, 5), rupies(2_000)],
    },
    {
      id: `${idPrefix}-3star`,
      label: `${label} Uncap 3★`,
      characterMasterId,
      targetUncap: 3,
      requirements: [namedItem(data.orb, 2), namedItem(data.scale, 2), namedItem(data.whorl, 3), RAINBOW_PRISM(3), namedItem(data.omegaAnima, 3), rupies(4_000)],
    },
    {
      id: `${idPrefix}-4star`,
      label: `${label} Uncap 4★`,
      characterMasterId,
      targetUncap: 4,
      requirements: [namedItem(fourStarAnima, 1), namedItem(fourStarUnique, 1), namedItem('Supreme Merit', 3), rupies(20_000)],
    },
  ];
};

const evokerBaseUncaps = (
  idPrefix: string,
  label: string,
  characterMasterId: string,
  element: ElementKey,
  verumProofs: readonly string[],
  astra: string,
  idean: string,
  haze: 'Aurora Haze' | 'Chaotic Haze',
): UpgradeGoal[] => {
  const data = SSR_UNCAP[element];
  const proofRequirements = (total: number): MaterialRequirement[] => {
    const each = total / verumProofs.length;
    return verumProofs.map((name) => namedItem(name, each));
  };
  return [
    {
      id: `${idPrefix}-1star`,
      label: `${label} Uncap 1★`,
      characterMasterId,
      targetUncap: 1,
      requirements: [...proofRequirements(2), namedItem('Flawless Prism', 5), namedItem('Supreme Merit', 1), rupies(1_000)],
    },
    {
      id: `${idPrefix}-2star`,
      label: `${label} Uncap 2★`,
      characterMasterId,
      targetUncap: 2,
      requirements: [namedItem(astra, 1), ...proofRequirements(2), namedItem('Flawless Prism', 10), namedItem(data.scale, 1), namedItem('Supreme Merit', 3), rupies(2_000)],
    },
    {
      id: `${idPrefix}-3star`,
      label: `${label} Uncap 3★`,
      characterMasterId,
      targetUncap: 3,
      requirements: [namedItem(astra, 2), ...proofRequirements(6), RAINBOW_PRISM(3), namedItem(idean, 1), namedItem('Supreme Merit', 6), rupies(4_000)],
    },
    {
      id: `${idPrefix}-4star`,
      label: `${label} Uncap 4★`,
      characterMasterId,
      targetUncap: 4,
      requirements: [namedItem(astra, 3), ...proofRequirements(10), namedItem(haze, 3), namedItem(idean, 1), namedItem('Supreme Merit', 10), rupies(20_000)],
    },
  ];
};

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

const eternalTranscendenceStage2 = (
  id: string,
  label: string,
  characterMasterId: string,
  omegaAnima: string,
  urn: MaterialRequirement,
  fragment: string,
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 2 (Lv120)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 120,
  requirements: [
    namedItem(omegaAnima, 50),
    urn,
    namedItem(fragment, 50),
    namedItem('Primeval Horn', 100),
    namedItem('Legendary Merit', 100),
    namedItem('Blue-Sky Spirit', 1),
    rupies(5_000_000),
  ],
  prerequisiteNotes: [
    'All 10 Eternals recruited: not proven by the current generalized roster snapshot.',
  ],
});

const eternalTranscendenceStage3 = (
  id: string,
  label: string,
  characterMasterId: string,
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 3 (Lv130)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 130,
  requirements: [item('6511', 'Lapis Merit', 1)],
  prerequisiteNotes: [
    'Associated Six-Dragon Advent cleared: unknown from the current passive snapshot.',
    'Associated Six-Dragon Raid hosted and cleared: unknown from the current passive snapshot.',
  ],
});

const eternalTranscendenceStage4 = (
  id: string,
  label: string,
  characterMasterId: string,
  omegaAnima: string,
  lusters: MaterialRequirement[],
  weaponStone: string,
  quartz: string,
  dragonJewel: string,
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 4 (Lv140)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 140,
  requirements: [
    namedItem(omegaAnima, 30),
    ...lusters,
    namedItem(weaponStone, 2_000),
    namedItem(quartz, 2_000),
    namedItem(dragonJewel, 300),
    namedItem("True Dragon's Golden Scale", 50),
    rupies(5_000_000),
  ],
  prerequisiteNotes: [
    'All 10 Eternals at 5★: not proven by the current generalized roster snapshot.',
  ],
});

const eternalTranscendenceStage5 = (
  id: string,
  label: string,
  characterMasterId: string,
): UpgradeGoal => ({
  id,
  label: `${label} Transcendence Stage 5 (Lv150)`,
  characterMasterId,
  targetUncap: 6,
  targetLevel: 150,
  requirements: [
    item('538', 'Tears of the Apocalypse', 30),
    namedItem('Abyssal Wing', 30),
    namedItem("Cunning Devil's Horn", 30),
    item('6511', 'Lapis Merit', 1),
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
  ...standardSsrUncap('eternal-anre', 'Anre', '3040030000', 'water', 'Dusk Anima', 'Fanned Fin'),
  ...standardSsrUncap('eternal-tweyen', 'Tweyen', '3040031000', 'light', 'Dawn Anima', 'Primal Bit'),
  ...standardSsrUncap('eternal-threo', 'Threo', '3040032000', 'earth', 'Dusk Anima', 'Genesis Bud'),
  ...standardSsrUncap('eternal-feower', 'Feower', '3040033000', 'water', 'Dusk Anima', 'Fanned Fin'),
  ...standardSsrUncap('eternal-fif', 'Fif', '3040034000', 'light', 'Dawn Anima', 'Primal Bit'),
  ...standardSsrUncap('eternal-seox', 'Seox', '3040035000', 'dark', 'Dusk Anima', 'Black Fog Sphere'),
  ...standardSsrUncap('eternal-seofon', 'Seofon', '3040036000', 'wind', 'Dawn Anima', 'Green Dragon Eye'),
  ...standardSsrUncap('eternal-eahta', 'Eahta', '3040037000', 'earth', 'Dusk Anima', 'Genesis Bud'),
  ...standardSsrUncap('eternal-niyon', 'Niyon', '3040038000', 'wind', 'Dawn Anima', 'Green Dragon Eye'),
  ...standardSsrUncap('eternal-tien', 'Tien', '3040039000', 'fire', 'Dawn Anima', 'Resolute Reactor'),

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

  eternalTranscendenceStage2('eternal-anre-transcendence-2', 'Anre', '3040030000', 'Europa Omega Anima', WATER_URN(300), 'One-Star Fragment'),
  eternalTranscendenceStage2('eternal-tweyen-transcendence-2', 'Tweyen', '3040031000', 'Metatron Omega Anima', LIGHT_URN(300), 'Two-Star Fragment'),
  eternalTranscendenceStage2('eternal-threo-transcendence-2', 'Threo', '3040032000', 'Alexiel Omega Anima', EARTH_URN(300), 'Three-Star Fragment'),
  eternalTranscendenceStage2('eternal-feower-transcendence-2', 'Feower', '3040033000', 'Europa Omega Anima', WATER_URN(300), 'Four-Star Fragment'),
  eternalTranscendenceStage2('eternal-fif-transcendence-2', 'Fif', '3040034000', 'Metatron Omega Anima', LIGHT_URN(300), 'Five-Star Fragment'),
  eternalTranscendenceStage2('eternal-seox-transcendence-2', 'Seox', '3040035000', 'Avatar Omega Anima', DARK_URN(300), 'Six-Star Fragment'),
  eternalTranscendenceStage2('eternal-seofon-transcendence-2', 'Seofon', '3040036000', 'Grimnir Omega Anima', WIND_URN(300), 'Seven-Star Fragment'),
  eternalTranscendenceStage2('eternal-eahta-transcendence-2', 'Eahta', '3040037000', 'Alexiel Omega Anima', EARTH_URN(300), 'Eight-Star Fragment'),
  eternalTranscendenceStage2('eternal-niyon-transcendence-2', 'Niyon', '3040038000', 'Grimnir Omega Anima', WIND_URN(300), 'Nine-Star Fragment'),
  eternalTranscendenceStage2('eternal-tien-transcendence-2', 'Tien', '3040039000', 'Shiva Omega Anima', FIRE_URN(300), 'Ten-Star Fragment'),
  eternalTranscendenceStage3('eternal-anre-transcendence-3', 'Anre', '3040030000'),
  eternalTranscendenceStage3('eternal-tweyen-transcendence-3', 'Tweyen', '3040031000'),
  eternalTranscendenceStage3('eternal-threo-transcendence-3', 'Threo', '3040032000'),
  eternalTranscendenceStage3('eternal-feower-transcendence-3', 'Feower', '3040033000'),
  eternalTranscendenceStage3('eternal-fif-transcendence-3', 'Fif', '3040034000'),
  eternalTranscendenceStage3('eternal-seox-transcendence-3', 'Seox', '3040035000'),
  eternalTranscendenceStage3('eternal-seofon-transcendence-3', 'Seofon', '3040036000'),
  eternalTranscendenceStage3('eternal-eahta-transcendence-3', 'Eahta', '3040037000'),
  eternalTranscendenceStage3('eternal-niyon-transcendence-3', 'Niyon', '3040038000'),
  eternalTranscendenceStage3('eternal-tien-transcendence-3', 'Tien', '3040039000'),
  eternalTranscendenceStage4('eternal-anre-transcendence-4', 'Anre', '3040030000', 'Qilin Omega Anima', [AQUA_LUSTER(30)], 'Spear Stone', 'Water Quartz', "Wamdus's Jewel"),
  eternalTranscendenceStage4('eternal-tweyen-transcendence-4', 'Tweyen', '3040031000', 'Huanglong Omega Anima', [IGNIS_LUSTER(15), VENTUS_LUSTER(15)], 'Bow Stone', 'Light Quartz', "Lu Woh's Jewel"),
  eternalTranscendenceStage4('eternal-threo-transcendence-4', 'Threo', '3040032000', 'Qilin Omega Anima', [TERRA_LUSTER(30)], 'Axe Stone', 'Earth Quartz', "Galleon's Jewel"),
  eternalTranscendenceStage4('eternal-feower-transcendence-4', 'Feower', '3040033000', 'Qilin Omega Anima', [AQUA_LUSTER(30)], 'Dagger Stone', 'Water Quartz', "Wamdus's Jewel"),
  eternalTranscendenceStage4('eternal-fif-transcendence-4', 'Fif', '3040034000', 'Huanglong Omega Anima', [IGNIS_LUSTER(15), VENTUS_LUSTER(15)], 'Staff Stone', 'Light Quartz', "Lu Woh's Jewel"),
  eternalTranscendenceStage4('eternal-seox-transcendence-4', 'Seox', '3040035000', 'Qilin Omega Anima', [AQUA_LUSTER(15), TERRA_LUSTER(15)], 'Melee Stone', 'Dark Quartz', "Fediel's Jewel"),
  eternalTranscendenceStage4('eternal-seofon-transcendence-4', 'Seofon', '3040036000', 'Huanglong Omega Anima', [VENTUS_LUSTER(30)], 'Sword Stone', 'Wind Quartz', "Ewiyar's Jewel"),
  eternalTranscendenceStage4('eternal-eahta-transcendence-4', 'Eahta', '3040037000', 'Qilin Omega Anima', [TERRA_LUSTER(30)], 'Katana Stone', 'Earth Quartz', "Galleon's Jewel"),
  eternalTranscendenceStage4('eternal-niyon-transcendence-4', 'Niyon', '3040038000', 'Huanglong Omega Anima', [VENTUS_LUSTER(30)], 'Harp Stone', 'Wind Quartz', "Ewiyar's Jewel"),
  eternalTranscendenceStage4('eternal-tien-transcendence-4', 'Tien', '3040039000', 'Huanglong Omega Anima', [IGNIS_LUSTER(30)], 'Pistol Stone', 'Fire Quartz', "Wilnas's Jewel"),
  eternalTranscendenceStage5('eternal-anre-transcendence-5', 'Anre', '3040030000'),
  eternalTranscendenceStage5('eternal-tweyen-transcendence-5', 'Tweyen', '3040031000'),
  eternalTranscendenceStage5('eternal-threo-transcendence-5', 'Threo', '3040032000'),
  eternalTranscendenceStage5('eternal-feower-transcendence-5', 'Feower', '3040033000'),
  eternalTranscendenceStage5('eternal-fif-transcendence-5', 'Fif', '3040034000'),
  eternalTranscendenceStage5('eternal-seox-transcendence-5', 'Seox', '3040035000'),
  eternalTranscendenceStage5('eternal-seofon-transcendence-5', 'Seofon', '3040036000'),
  eternalTranscendenceStage5('eternal-eahta-transcendence-5', 'Eahta', '3040037000'),
  eternalTranscendenceStage5('eternal-niyon-transcendence-5', 'Niyon', '3040038000'),
  eternalTranscendenceStage5('eternal-tien-transcendence-5', 'Tien', '3040039000'),


  ...evokerBaseUncaps('evoker-maria', 'Maria Theresa', '3040160000', 'water', ['Water Verum Proof'], 'Aquaborne Astra', 'Justice Idean', 'Chaotic Haze'),
  ...evokerBaseUncaps('evoker-fraux', 'Fraux', '3040161000', 'fire', ['Fire Verum Proof'], 'Flameborne Astra', 'Devil Idean', 'Aurora Haze'),
  ...evokerBaseUncaps('evoker-geisenborger', 'Geisenborger', '3040162000', 'light', ['Fire Verum Proof', 'Wind Verum Proof'], 'Lightborne Astra', 'Star Idean', 'Aurora Haze'),
  ...evokerBaseUncaps('evoker-estarriola', 'Estarriola', '3040163000', 'wind', ['Wind Verum Proof'], 'Windborne Astra', 'Temperance Idean', 'Aurora Haze'),
  ...evokerBaseUncaps('evoker-caim', 'Caim', '3040164000', 'earth', ['Earth Verum Proof'], 'Earthborne Astra', 'Hanged Man Idean', 'Chaotic Haze'),
  ...evokerBaseUncaps('evoker-lobelia', 'Lobelia', '3040165000', 'earth', ['Earth Verum Proof'], 'Earthborne Astra', 'Tower Idean', 'Chaotic Haze'),
  ...evokerBaseUncaps('evoker-katzelia', 'Katzelia', '3040166000', 'wind', ['Wind Verum Proof'], 'Windborne Astra', 'Judgement Idean', 'Aurora Haze'),
  ...evokerBaseUncaps('evoker-alanaan', 'Alanaan', '3040167000', 'fire', ['Fire Verum Proof'], 'Flameborne Astra', 'Sun Idean', 'Aurora Haze'),
  ...evokerBaseUncaps('evoker-haaselia', 'Haaselia', '3040168000', 'water', ['Water Verum Proof'], 'Aquaborne Astra', 'Moon Idean', 'Chaotic Haze'),
  ...evokerBaseUncaps('evoker-nier', 'Nier', '3040169000', 'dark', ['Water Verum Proof', 'Earth Verum Proof'], 'Darkborne Astra', 'Death Idean', 'Chaotic Haze'),

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
