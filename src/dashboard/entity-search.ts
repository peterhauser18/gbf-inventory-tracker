import type { DashboardCard, DashboardSection, DashboardViewModel } from './model.ts';

export type DashboardEntityKind = DashboardCard['kind'] | 'stash-weapon';

export interface DashboardEntitySearchResult {
  key: string;
  title: string;
  subtitle: string;
  kind: DashboardEntityKind;
  typeLabel: string;
  section: Exclude<DashboardSection, 'overview'>;
  parentKey?: string;
}

export interface DashboardEntityOpenPlan {
  section: DashboardEntitySearchResult['section'];
  detailKeys: string[];
}

type IndexedEntity = DashboardEntitySearchResult & {
  fields: SearchField[];
  order: number;
};

type SearchField = {
  value: string;
  weight: 'title' | 'subtitle' | 'detail';
};

const TYPE_LABELS: Record<DashboardEntityKind, string> = {
  eternal: 'Eternal',
  evoker: 'Evoker',
  character: 'Character',
  weapon: 'Weapon',
  summon: 'Summon',
  treasure: 'Treasure',
  consumable: 'Consumable',
  ticket: 'Ticket',
  stash: 'Weapon Stash',
  'stash-weapon': 'Stash Weapon',
};

export function searchDashboardEntities(
  view: DashboardViewModel,
  query: string,
): DashboardEntitySearchResult[] {
  const terms = normalizeQuery(query);
  if (terms.length === 0) return [];

  return indexDashboardEntities(view)
    .map((entity) => ({ entity, score: entityScore(entity, terms) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.entity.order - right.entity.order)
    .map(({ entity: { fields: _fields, order: _order, ...result } }) => result);
}

export function entityOpenPlan(result: DashboardEntitySearchResult): DashboardEntityOpenPlan {
  return {
    section: result.section,
    detailKeys: result.parentKey ? [result.parentKey, result.key] : [result.key],
  };
}

function indexDashboardEntities(view: DashboardViewModel): IndexedEntity[] {
  const indexed: IndexedEntity[] = [];
  let order = 0;
  const add = (
    card: DashboardCard,
    section: DashboardEntitySearchResult['section'],
    options: { parentKey?: string; kind?: DashboardEntityKind; context?: string } = {},
  ): void => {
    const kind = options.kind ?? card.kind;
    const subtitle = options.context ? `${options.context} · ${card.subtitle}` : card.subtitle;
    indexed.push({
      key: card.key,
      title: card.title,
      subtitle,
      kind,
      typeLabel: TYPE_LABELS[kind],
      section,
      parentKey: options.parentKey,
      fields: [
        { value: card.title, weight: 'title' },
        { value: subtitle, weight: 'subtitle' },
        { value: card.key, weight: 'detail' },
        ...card.detailFields.map((field) => ({ value: field.value, weight: 'detail' as const })),
      ],
      order: order++,
    });
  };

  for (const card of view.eternals) add(card, 'eternals');
  for (const card of view.evokers) add(card, 'evokers');
  for (const card of view.characters) add(card, 'characters');
  for (const card of view.weapons) add(card, 'weapons');
  for (const card of view.summons) add(card, 'summons');
  for (const card of view.treasures) add(card, 'treasures');
  for (const card of view.consumables) add(card, 'consumables');
  for (const card of view.tickets) add(card, 'consumables');
  for (const stash of view.stashes) {
    add(stash, 'stashes');
    const stashId = stash.detailFields.find((field) => field.label === 'Stash ID')?.value;
    const context = stashId ? `Stash ${stashId}` : stash.title;
    for (const child of stash.children ?? []) {
      add(child, 'stashes', {
        parentKey: stash.key,
        kind: 'stash-weapon',
        context,
      });
    }
  }

  return indexed;
}

function normalizeQuery(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function entityScore(entity: IndexedEntity, terms: readonly string[]): number {
  let score = 0;
  for (const term of terms) {
    let best = 0;
    for (const field of entity.fields) {
      const candidate = field.value.trim().toLowerCase();
      if (!candidate) continue;
      best = Math.max(best, fieldScore(candidate, field.weight, term));
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

function fieldScore(candidate: string, weight: SearchField['weight'], term: string): number {
  if (weight === 'title') {
    if (candidate === term) return 1_000;
    if (candidate.startsWith(term)) return 700;
    if (candidate.includes(term)) return 500;
    return 0;
  }
  if (weight === 'subtitle') {
    if (candidate === term) return 180;
    if (candidate.startsWith(term)) return 150;
    if (candidate.includes(term)) return 120;
    return 0;
  }
  if (candidate === term) return 110;
  if (candidate.startsWith(term)) return 90;
  if (candidate.includes(term)) return 70;
  return 0;
}
