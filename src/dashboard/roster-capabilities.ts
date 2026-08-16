import type { AccountSnapshot, CharacterInstance, DataQuality, Element } from '../types/account.ts';

export const ROSTER_CAPABILITIES = [
  'dispel',
  'delay',
  'gravity',
  'clear',
  'veil',
  'heal',
  'revive',
  'substitute',
  'shield',
  'damage-cut',
] as const;

export type RosterCapabilityKey = typeof ROSTER_CAPABILITIES[number];
export type CapabilityState = boolean | undefined;

export const ROSTER_CAPABILITY_LABELS: Record<RosterCapabilityKey, string> = {
  dispel: 'Dispel',
  delay: 'Delay',
  gravity: 'Gravity',
  clear: 'Clear',
  veil: 'Veil',
  heal: 'Heal',
  revive: 'Revive',
  substitute: 'Substitute',
  shield: 'Shield',
  'damage-cut': 'DMG Cut',
};

export interface WikiRosterCharacterMeta {
  masterId: string;
  name: string;
  wikiTitle: string;
  element?: Element;
  style?: string;
  races: string[];
  weapons: string[];
}

export interface WikiRosterCatalog {
  characters: ReadonlyMap<string, WikiRosterCharacterMeta>;
  capabilitiesById: ReadonlyMap<string, ReadonlySet<RosterCapabilityKey>>;
  capabilitiesByTitle: ReadonlyMap<string, ReadonlySet<RosterCapabilityKey>>;
  baseQuality: DataQuality;
  capabilityQuality: DataQuality;
  sourceQuality: {
    skills: DataQuality;
    passives: DataQuality;
    ougi: DataQuality;
  };
}

export interface RosterCapabilityRow {
  masterId: string;
  name: string;
  element?: Element;
  style?: string;
  races: string[];
  weapons: string[];
  capabilities: Record<RosterCapabilityKey, CapabilityState>;
  metadataQuality: DataQuality;
  rosterQuality: DataQuality;
}

export interface RosterFilter {
  query?: string;
  element?: Element | 'all';
  capability?: RosterCapabilityKey | 'all';
}

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

type JsonObject = Record<string, unknown>;

const WIKI_API = 'https://gbf.wiki/api.php';
const PAGE_SIZE = 500;

export async function loadWikiRosterCatalog(fetcher: FetchLike = fetch): Promise<WikiRosterCatalog> {
  const [charactersResult, skillsResult, passivesResult, ougiResult] = await Promise.allSettled([
    loadCargoRows('characters', 'id,_pageName=page,element,type,race,weapon', fetcher),
    loadCargoRows('character_skills', 'character_id,_pageName=page,description', fetcher),
    loadCargoRows('character_passives', '_pageName=page,description', fetcher),
    loadCargoRows('character_ougi', '_pageName=page,description', fetcher),
  ]);

  const characters = charactersResult.status === 'fulfilled'
    ? characterMetadata(charactersResult.value)
    : new Map<string, WikiRosterCharacterMeta>();
  const capabilitiesById = new Map<string, Set<RosterCapabilityKey>>();
  const capabilitiesByTitle = new Map<string, Set<RosterCapabilityKey>>();

  if (skillsResult.status === 'fulfilled') {
    collectCapabilityRows(skillsResult.value, capabilitiesById, capabilitiesByTitle, true);
  }
  if (passivesResult.status === 'fulfilled') {
    collectCapabilityRows(passivesResult.value, capabilitiesById, capabilitiesByTitle, false);
  }
  if (ougiResult.status === 'fulfilled') {
    collectCapabilityRows(ougiResult.value, capabilitiesById, capabilitiesByTitle, false);
  }

  const sourceQuality = {
    skills: resultQuality(skillsResult),
    passives: resultQuality(passivesResult),
    ougi: resultQuality(ougiResult),
  } satisfies WikiRosterCatalog['sourceQuality'];

  return {
    characters,
    capabilitiesById,
    capabilitiesByTitle,
    baseQuality: resultQuality(charactersResult),
    capabilityQuality: combineQuality(Object.values(sourceQuality)),
    sourceQuality,
  };
}

export function buildRosterCapabilityRows(
  snapshot: Pick<AccountSnapshot, 'characters' | 'quality'>,
  catalog: WikiRosterCatalog,
): RosterCapabilityRow[] {
  return snapshot.characters.map((character) => buildRosterRow(character, snapshot.quality.characters, catalog))
    .sort((left, right) => (left.element ?? 'zz').localeCompare(right.element ?? 'zz') || left.name.localeCompare(right.name));
}

export function filterRosterCapabilityRows(
  rows: readonly RosterCapabilityRow[],
  filter: RosterFilter,
): RosterCapabilityRow[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return rows.filter((row) => {
    if (filter.element && filter.element !== 'all' && row.element !== filter.element) return false;
    if (filter.capability && filter.capability !== 'all' && row.capabilities[filter.capability] !== true) return false;
    if (!query) return true;
    return [row.name, row.masterId, row.style ?? '', ...row.races, ...row.weapons]
      .some((value) => value.toLowerCase().includes(query));
  });
}

export function detectRosterCapabilities(description: string): Set<RosterCapabilityKey> {
  const text = normalizeDescription(description);
  const result = new Set<RosterCapabilityKey>();

  if (/\bremove(?:s)?\s+(?:1|one|a|all|\d+)\s+buffs?\b/.test(text)) result.add('dispel');
  if (/\binflict(?:s)?\b[^.\n]{0,60}\bdelay\b/.test(text) || /\breduce(?:s)?\s+(?:a\s+|the\s+)?foe['’]?s\s+filled\s+charge\s+diamonds?\s+by\b/.test(text)) result.add('delay');
  if (/\binflict(?:s)?\b[^.\n]{0,60}\bgravity\b/.test(text) || /\bmax\s+charge\s+diamonds?\s+(?:are|is)\s+increased\b/.test(text)) result.add('gravity');
  if (/\bremove(?:s)?\s+(?:1|one|a|all|\d+)\s+debuffs?\b/.test(text)) result.add('clear');
  if (/\b(?:gain|gains|grant|grants|apply|applies)\b[^.\n]{0,60}\bveil\b/.test(text) || /\bdebuffs?\s+will\s+be\s+nullified\b/.test(text)) result.add('veil');
  if (/\brestore(?:s)?\b[^.\n]{0,90}\bhp\b/.test(text) || /\bheal(?:s|ing)?\b[^.\n]{0,70}\bhp\b/.test(text)) result.add('heal');
  if (/\brevive(?:s)?\b[^.\n]{0,70}\b(?:ally|allies)\b/.test(text) || /\brestore(?:s)?\b[^.\n]{0,70}\bfallen\s+(?:ally|allies)\b/.test(text)) result.add('revive');
  if (/\b(?:gain|gains|grant|grants|apply|applies)\b[^.\n]{0,60}\bsubstitute\b/.test(text) || /\breceives?\s+foe\s+attacks?\s+in\s+place\s+of\s+an\s+ally\b/.test(text)) result.add('substitute');
  if (/\b(?:gain|gains|grant|grants|apply|applies)\b[^.\n]{0,60}\bshield(?:\s+effect)?\b/.test(text)) result.add('shield');
  if (/\b(?:gain|gains|grant|grants|apply|applies)\b[^.\n]{0,70}\b(?:damage|dmg)\s+cut\b/.test(text) || /\b\d+%\s+[a-z]+\s+(?:damage|dmg)\s+cut\b/.test(text)) result.add('damage-cut');

  return result;
}

export function normalizeWikiCharacterTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function buildRosterRow(
  character: CharacterInstance,
  rosterQuality: DataQuality,
  catalog: WikiRosterCatalog,
): RosterCapabilityRow {
  const meta = catalog.characters.get(character.masterId);
  const detected = new Set<RosterCapabilityKey>();
  for (const capability of catalog.capabilitiesById.get(character.masterId) ?? []) detected.add(capability);
  if (meta) {
    for (const capability of catalog.capabilitiesByTitle.get(normalizeWikiCharacterTitle(meta.wikiTitle)) ?? []) detected.add(capability);
  }

  const canConcludeAbsence = catalog.capabilityQuality === 'known' && Boolean(meta);
  const capabilities = Object.fromEntries(ROSTER_CAPABILITIES.map((key) => [
    key,
    detected.has(key) ? true : canConcludeAbsence ? false : undefined,
  ])) as Record<RosterCapabilityKey, CapabilityState>;

  return {
    masterId: character.masterId,
    name: meta?.name ?? character.name ?? `Character ${character.masterId}`,
    element: character.element ?? meta?.element,
    style: meta?.style,
    races: meta?.races ?? [],
    weapons: meta?.weapons ?? [],
    capabilities,
    metadataQuality: rowMetadataQuality(meta, catalog),
    rosterQuality,
  };
}

function rowMetadataQuality(meta: WikiRosterCharacterMeta | undefined, catalog: WikiRosterCatalog): DataQuality {
  const base = meta ? catalog.baseQuality : 'unknown';
  return combineQuality([base, catalog.capabilityQuality]);
}

function characterMetadata(rows: readonly JsonObject[]): Map<string, WikiRosterCharacterMeta> {
  const result = new Map<string, WikiRosterCharacterMeta>();
  for (const row of rows) {
    const masterId = text(row.id);
    const page = text(row.page ?? row._pageName);
    if (!masterId || !page) continue;
    result.set(masterId, {
      masterId,
      name: page,
      wikiTitle: page,
      element: parseElement(text(row.element)),
      style: text(row.type),
      races: list(row.race),
      weapons: list(row.weapon),
    });
  }
  return result;
}

function collectCapabilityRows(
  rows: readonly JsonObject[],
  byId: Map<string, Set<RosterCapabilityKey>>,
  byTitle: Map<string, Set<RosterCapabilityKey>>,
  useId: boolean,
): void {
  for (const row of rows) {
    const description = text(row.description);
    if (!description) continue;
    const detected = detectRosterCapabilities(description);
    if (detected.size === 0) continue;
    if (useId) {
      const characterId = text(row.character_id);
      if (characterId) mergeCapabilities(byId, characterId, detected);
    }
    const page = text(row.page ?? row._pageName);
    if (page) mergeCapabilities(byTitle, normalizeWikiCharacterTitle(page), detected);
  }
}

function mergeCapabilities(
  target: Map<string, Set<RosterCapabilityKey>>,
  key: string,
  capabilities: ReadonlySet<RosterCapabilityKey>,
): void {
  const current = target.get(key) ?? new Set<RosterCapabilityKey>();
  for (const capability of capabilities) current.add(capability);
  target.set(key, current);
}

async function loadCargoRows(table: string, fields: string, fetcher: FetchLike): Promise<JsonObject[]> {
  const rows: JsonObject[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(WIKI_API);
    url.searchParams.set('action', 'cargoquery');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');
    url.searchParams.set('tables', table);
    url.searchParams.set('fields', fields);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    const response = await fetcher(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`GBF Wiki roster request failed (${table}: ${response.status})`);
    const pageRows = cargoRows(await response.json());
    if (!pageRows) throw new Error(`GBF Wiki roster response was not a Cargo row set (${table})`);
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }
  return rows;
}

function cargoRows(body: unknown): JsonObject[] | undefined {
  if (!isObject(body) || !Array.isArray(body.cargoquery)) return undefined;
  return body.cargoquery.flatMap((value) => {
    if (!isObject(value)) return [];
    return [isObject(value.title) ? value.title : value];
  });
}

function resultQuality(result: PromiseSettledResult<unknown>): DataQuality {
  return result.status === 'fulfilled' ? 'known' : 'unknown';
}

function combineQuality(values: readonly DataQuality[]): DataQuality {
  if (values.length === 0 || values.every((value) => value === 'unknown')) return 'unknown';
  if (values.every((value) => value === 'known')) return 'known';
  return 'partial';
}

function normalizeDescription(value: string): string {
  return value
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseElement(value: string | undefined): Element | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'fire' || normalized === 'water' || normalized === 'earth' || normalized === 'wind' || normalized === 'light' || normalized === 'dark'
    ? normalized
    : undefined;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => text(item) ? [text(item)!] : []);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(/\s*[,;/]\s*/).map((entry) => entry.trim()).filter(Boolean);
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
