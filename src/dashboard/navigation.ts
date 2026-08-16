export type DashboardDestinationKey =
  | 'overview'
  | 'goals'
  | 'combat'
  | 'raids'
  | 'eternals'
  | 'evokers'
  | 'characters'
  | 'weapons'
  | 'summons'
  | 'treasures'
  | 'consumables'
  | 'stashes'
  | 'settings'
  | 'developer';

export type DashboardNavigationGroup = 'overview' | 'detail' | 'system';
export type DashboardDestinationOwner = 'dashboard' | 'combat' | 'goals';

export interface DashboardDestination {
  key: DashboardDestinationKey;
  label: string;
  description: string;
  group: DashboardNavigationGroup;
  owner: DashboardDestinationOwner;
  keywords: readonly string[];
}

export interface DashboardNavigationGroupDefinition {
  key: DashboardNavigationGroup;
  label: string;
  destinations: readonly DashboardDestinationKey[];
}

export const DASHBOARD_DESTINATIONS: readonly DashboardDestination[] = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Account coverage and planner readiness at a glance.',
    group: 'overview',
    owner: 'dashboard',
    keywords: ['home', 'dashboard', 'summary', 'status'],
  },
  {
    key: 'goals',
    label: 'Goals',
    description: 'Pinned Eternal and Evoker targets, next actions and material deficits.',
    group: 'overview',
    owner: 'goals',
    keywords: ['pins', 'targets', 'progress', 'next actions', 'materials', 'deficits'],
  },
  {
    key: 'combat',
    label: 'Combat',
    description: 'Local read-only combat analytics from already received responses.',
    group: 'detail',
    owner: 'combat',
    keywords: ['analytics', 'battle', 'damage', 'raid log'],
  },
  {
    key: 'raids',
    label: 'Raids',
    description: 'Local raid history, tracked drops, notes and observed rates.',
    group: 'detail',
    owner: 'combat',
    keywords: ['drops', 'history', 'tracker', 'rate'],
  },
  {
    key: 'eternals',
    label: 'Eternals',
    description: 'Observed Eternal state and verified upgrade material plans.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['uncap', 'transcendence', 'materials', 'progress'],
  },
  {
    key: 'evokers',
    label: 'Evokers',
    description: 'Observed Evoker state and verified upgrade material plans.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['arcarum', 'uncap', 'materials', 'progress'],
  },
  {
    key: 'characters',
    label: 'Characters',
    description: 'Observed character collection and public metadata.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['roster', 'collection', 'units', 'inventory'],
  },
  {
    key: 'weapons',
    label: 'Weapons',
    description: 'Observed primary weapon inventory.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['inventory', 'grid', 'gear'],
  },
  {
    key: 'summons',
    label: 'Summons',
    description: 'Observed summon inventory.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['inventory', 'collection'],
  },
  {
    key: 'treasures',
    label: 'Treasures',
    description: 'Observed treasure and material quantities.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['materials', 'inventory', 'items'],
  },
  {
    key: 'consumables',
    label: 'Consumables / Tickets',
    description: 'Observed consumables, tickets and related item groups.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['items', 'inventory', 'tickets'],
  },
  {
    key: 'stashes',
    label: 'Weapon Stashes',
    description: 'Observed weapon containers outside the primary inventory.',
    group: 'detail',
    owner: 'dashboard',
    keywords: ['stash', 'inventory', 'weapons'],
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Appearance and local dashboard status.',
    group: 'system',
    owner: 'dashboard',
    keywords: ['theme', 'appearance', 'local status', 'preferences'],
  },
  {
    key: 'developer',
    label: 'Developer',
    description: 'Diagnostic and local-storage tooling kept separate from normal use.',
    group: 'system',
    owner: 'dashboard',
    keywords: ['diagnostic', 'observation', 'scan', 'storage', 'debug'],
  },
] as const;

export const DASHBOARD_NAV_GROUPS: readonly DashboardNavigationGroupDefinition[] = [
  { key: 'overview', label: 'Overview', destinations: ['overview', 'goals'] },
  {
    key: 'detail',
    label: 'Detail',
    destinations: ['combat', 'raids', 'eternals', 'evokers', 'characters', 'weapons', 'summons', 'treasures', 'consumables', 'stashes'],
  },
  { key: 'system', label: 'System', destinations: ['settings', 'developer'] },
] as const;

export function dashboardDestination(key: DashboardDestinationKey): DashboardDestination {
  const destination = DASHBOARD_DESTINATIONS.find((candidate) => candidate.key === key);
  if (!destination) throw new Error(`Unknown dashboard destination: ${key}`);
  return destination;
}

export function searchDashboardDestinations(query: string): DashboardDestination[] {
  const terms = normalizeQuery(query);
  if (terms.length === 0) return [...DASHBOARD_DESTINATIONS];

  return DASHBOARD_DESTINATIONS
    .map((destination) => ({ destination, score: destinationScore(destination, terms) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.destination.label.localeCompare(right.destination.label))
    .map((candidate) => candidate.destination);
}

function normalizeQuery(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function destinationScore(destination: DashboardDestination, terms: readonly string[]): number {
  const label = destination.label.toLowerCase();
  const key = destination.key.toLowerCase();
  const description = destination.description.toLowerCase();
  const keywords = destination.keywords.map((keyword) => keyword.toLowerCase());

  let score = 0;
  for (const term of terms) {
    if (label === term || key === term) score += 12;
    else if (label.startsWith(term) || key.startsWith(term)) score += 8;
    else if (label.includes(term) || key.includes(term)) score += 6;
    else if (keywords.some((keyword) => keyword === term)) score += 5;
    else if (keywords.some((keyword) => keyword.includes(term))) score += 3;
    else if (description.includes(term)) score += 1;
    else return 0;
  }
  return score;
}
