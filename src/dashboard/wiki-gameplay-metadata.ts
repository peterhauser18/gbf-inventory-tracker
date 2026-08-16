import {
  loadWikiCargoRows,
  loadWikiCharacterSkillRows,
  type WikiCargoFetchLike,
  type WikiCargoRow,
} from './wiki-cargo.ts';

const WEAPON_SKILL_FIELDS = '_pageName=page,ix,type,upgrade,name,text=description';
const SUMMON_FIELDS = [
  'id',
  '_pageName=page',
  'call_name',
  'call1',
  'call2',
  'call3',
  'call4',
  'call5',
  'aura1',
  'aura2',
  'aura3',
  'aura4',
  'aura5',
].join(',');

export type WikiGameplayFamily = 'characters' | 'weapons' | 'summons';

export interface WikiAbilityText {
  name: string;
  description: string;
}

export interface WikiSummonEffectText {
  name?: string;
  description: string;
}

export interface WikiSummonSource {
  masterId: string;
  wikiTitle?: string;
  callName?: string;
  calls: ReadonlyArray<string | undefined>;
  auras: ReadonlyArray<string | undefined>;
}

export interface WikiSummonGameplayText {
  call?: WikiSummonEffectText;
  aura?: WikiSummonEffectText;
}

export interface WikiGameplayMetadataIndex {
  charactersById: ReadonlyMap<string, readonly WikiAbilityText[]>;
  weaponsByTitle: ReadonlyMap<string, readonly WikiAbilityText[]>;
  summonsById: ReadonlyMap<string, WikiSummonSource>;
  sourceQuality: {
    characters: 'known' | 'unknown';
    weapons: 'known' | 'unknown';
    summons: 'known' | 'unknown';
  };
}

const defaultFamilyPromises = new Map<WikiGameplayFamily, Promise<WikiGameplayMetadataIndex>>();
let defaultGameplayPromise: Promise<WikiGameplayMetadataIndex> | null = null;

export function loadWikiGameplayFamily(
  family: WikiGameplayFamily,
  fetcher: WikiCargoFetchLike = fetch,
): Promise<WikiGameplayMetadataIndex> {
  if (fetcher !== fetch) return loadWikiGameplayFamilyFresh(family, fetcher);
  const existing = defaultFamilyPromises.get(family);
  if (existing) return existing;

  const pending = loadWikiGameplayFamilyFresh(family, fetcher).catch((error) => {
    defaultFamilyPromises.delete(family);
    throw error;
  });
  defaultFamilyPromises.set(family, pending);
  return pending;
}

export function loadWikiGameplayMetadata(
  fetcher: WikiCargoFetchLike = fetch,
): Promise<WikiGameplayMetadataIndex> {
  if (fetcher !== fetch) return loadWikiGameplayMetadataFresh(fetcher);
  if (!defaultGameplayPromise) {
    defaultGameplayPromise = loadWikiGameplayMetadataFresh(fetcher).catch((error) => {
      defaultGameplayPromise = null;
      throw error;
    });
  }
  return defaultGameplayPromise;
}

export function normalizeWikiTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeWikiGameplayText(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;

  let normalized = raw
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1');

  for (let pass = 0; pass < 3; pass += 1) {
    normalized = normalized.replace(/\{\{[^{}|]+\|([^{}|]+)(?:\|[^{}]*)?\}\}/g, '$1');
  }

  normalized = normalized
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/'{2,}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || undefined;
}

export function selectSummonGameplay(
  source: WikiSummonSource | undefined,
  uncap: number | undefined,
): WikiSummonGameplayText {
  if (!source) return {};
  const slot = effectSlotForUncap(uncap);
  const callDescription = firstAvailableAtOrBelow(source.calls, slot);
  const auraDescription = firstAvailableAtOrBelow(source.auras, slot);
  return {
    call: callDescription
      ? { name: source.callName, description: callDescription }
      : undefined,
    aura: auraDescription
      ? { description: auraDescription }
      : undefined,
  };
}

async function loadWikiGameplayMetadataFresh(fetcher: WikiCargoFetchLike): Promise<WikiGameplayMetadataIndex> {
  const [charactersResult, weaponsResult, summonsResult] = await Promise.allSettled([
    loadWikiGameplayFamily('characters', fetcher),
    loadWikiGameplayFamily('weapons', fetcher),
    loadWikiGameplayFamily('summons', fetcher),
  ]);

  return {
    charactersById: charactersResult.status === 'fulfilled' ? charactersResult.value.charactersById : new Map(),
    weaponsByTitle: weaponsResult.status === 'fulfilled' ? weaponsResult.value.weaponsByTitle : new Map(),
    summonsById: summonsResult.status === 'fulfilled' ? summonsResult.value.summonsById : new Map(),
    sourceQuality: {
      characters: resultQuality(charactersResult),
      weapons: resultQuality(weaponsResult),
      summons: resultQuality(summonsResult),
    },
  };
}

async function loadWikiGameplayFamilyFresh(
  family: WikiGameplayFamily,
  fetcher: WikiCargoFetchLike,
): Promise<WikiGameplayMetadataIndex> {
  if (family === 'characters') {
    return familyIndex('characters', characterAbilities(await loadWikiCharacterSkillRows(fetcher)));
  }
  if (family === 'weapons') {
    return familyIndex('weapons', weaponAbilities(await loadWikiCargoRows('weapon_skills', WEAPON_SKILL_FIELDS, fetcher)));
  }
  return familyIndex('summons', summonSources(await loadWikiCargoRows('summons', SUMMON_FIELDS, fetcher)));
}

function familyIndex(
  family: WikiGameplayFamily,
  values: ReadonlyMap<string, readonly WikiAbilityText[]> | ReadonlyMap<string, WikiSummonSource>,
): WikiGameplayMetadataIndex {
  return {
    charactersById: family === 'characters'
      ? values as ReadonlyMap<string, readonly WikiAbilityText[]>
      : new Map(),
    weaponsByTitle: family === 'weapons'
      ? values as ReadonlyMap<string, readonly WikiAbilityText[]>
      : new Map(),
    summonsById: family === 'summons'
      ? values as ReadonlyMap<string, WikiSummonSource>
      : new Map(),
    sourceQuality: {
      characters: family === 'characters' ? 'known' : 'unknown',
      weapons: family === 'weapons' ? 'known' : 'unknown',
      summons: family === 'summons' ? 'known' : 'unknown',
    },
  };
}

function characterAbilities(rows: readonly WikiCargoRow[]): Map<string, WikiAbilityText[]> {
  const grouped = new Map<string, Array<{ ability: WikiAbilityText; order: number; ix: string }>>();
  for (const row of rows) {
    if (text(row.type)?.toLowerCase() !== 'skill') continue;
    const masterId = text(row.character_id);
    const name = normalizeWikiGameplayText(row.name);
    const description = normalizeWikiGameplayText(row.description);
    if (!masterId || !name || !description) continue;

    const item = {
      ability: { name, description },
      order: numeric(row.sort_order) ?? Number.MAX_SAFE_INTEGER,
      ix: text(row.ix) ?? '',
    };
    const current = grouped.get(masterId) ?? [];
    if (!current.some((candidate) => candidate.ix === item.ix && candidate.ability.name === name)) current.push(item);
    grouped.set(masterId, current);
  }

  return new Map([...grouped].map(([masterId, items]) => [
    masterId,
    items
      .sort((left, right) => left.order - right.order || compareIndex(left.ix, right.ix) || left.ability.name.localeCompare(right.ability.name))
      .map((item) => item.ability),
  ]));
}

function weaponAbilities(rows: readonly WikiCargoRow[]): Map<string, WikiAbilityText[]> {
  const candidates = new Map<string, Map<string, { ability: WikiAbilityText; upgrade: number }>>();
  for (const row of rows) {
    if (text(row.type)?.toLowerCase() !== 'base') continue;
    const page = text(row.page ?? row._pageName);
    const name = normalizeWikiGameplayText(row.name);
    const description = normalizeWikiGameplayText(row.description ?? row.text);
    if (!page || !name || !description) continue;

    const title = normalizeWikiTitle(page);
    const ix = text(row.ix) ?? name;
    const upgrade = numeric(row.upgrade) ?? 0;
    const byIndex = candidates.get(title) ?? new Map();
    const existing = byIndex.get(ix);
    if (!existing || upgrade < existing.upgrade) byIndex.set(ix, { ability: { name, description }, upgrade });
    candidates.set(title, byIndex);
  }

  return new Map([...candidates].map(([title, byIndex]) => [
    title,
    [...byIndex]
      .sort(([left], [right]) => compareIndex(left, right))
      .map(([, item]) => item.ability),
  ]));
}

function summonSources(rows: readonly WikiCargoRow[]): Map<string, WikiSummonSource> {
  const result = new Map<string, WikiSummonSource>();
  for (const row of rows) {
    const masterId = text(row.id);
    if (!masterId) continue;
    result.set(masterId, {
      masterId,
      wikiTitle: text(row.page ?? row._pageName),
      callName: normalizeWikiGameplayText(row.call_name),
      calls: [1, 2, 3, 4, 5].map((slot) => normalizeWikiGameplayText(row[`call${slot}`])),
      auras: [1, 2, 3, 4, 5].map((slot) => normalizeWikiGameplayText(row[`aura${slot}`])),
    });
  }
  return result;
}

function effectSlotForUncap(uncap: number | undefined): number {
  if (uncap === undefined || !Number.isFinite(uncap)) return 1;
  if (uncap <= 2) return 1;
  return Math.min(5, Math.max(1, Math.floor(uncap) - 1));
}

function firstAvailableAtOrBelow(values: ReadonlyArray<string | undefined>, slot: number): string | undefined {
  for (let index = Math.min(slot, values.length); index >= 1; index -= 1) {
    const value = values[index - 1];
    if (value) return value;
  }
  return undefined;
}

function compareIndex(left: string, right: string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, undefined, { numeric: true });
}

function resultQuality(result: PromiseSettledResult<unknown>): 'known' | 'unknown' {
  return result.status === 'fulfilled' ? 'known' : 'unknown';
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}
