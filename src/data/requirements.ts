import type { MaterialRequirement, UpgradeGoal } from '../planner/types.ts';

const item = (itemId: string, name: string, quantity: number): MaterialRequirement => ({
  id: `treasure:${itemId}`,
  itemId,
  name,
  quantity,
  source: 'treasures',
  wikiTitle: name,
});

const rupies = (): MaterialRequirement => ({
  id: 'currency:rupies',
  name: 'Rupies',
  quantity: 100_000,
  source: 'untracked',
  wikiTitle: 'Rupie',
});

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

// These goals model the final 5★ character uncap payment. Complex unlock paths remain
// prerequisite notes until the normalized snapshot can prove their account state.
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
