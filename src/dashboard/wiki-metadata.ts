import { installWikiImageCleanupControl } from './wiki-image-cleanup-ui.ts';
import {
  deferWikiImageUrl,
  deferredWikiImageTarget,
  installWikiImageDomLoader,
} from './wiki-image-loader.ts';
import { resolveSafeExternalImageUrl } from './resolver.ts';

installWikiImageDomLoader();
installWikiImageCleanupControl();

const WIKI_API = 'https://gbf.wiki/api.php';
const WIKI_ORIGIN = 'https://gbf.wiki';
const PAGE_SIZE = 500;
const ENTITY_METADATA_CACHE_KEY = 'gbfit:wiki-entity-metadata:v1';
export const WIKI_ENTITY_METADATA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type EntityMetadataKind = 'character' | 'weapon' | 'summon';

export interface EntityMetadata {
  masterId: string;
  name: string;
  wikiTitle: string;
  imageUrl?: string;
}

export interface EntityMetadataIndex {
  characters: ReadonlyMap<string, EntityMetadata>;
  weapons: ReadonlyMap<string, EntityMetadata>;
  summons: ReadonlyMap<string, EntityMetadata>;
}

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type JsonObject = Record<string, unknown>;

interface CachedEntityMetadataPayload {
  version: 1;
  cachedAt: number;
  characters: EntityMetadata[];
  weapons: EntityMetadata[];
  summons: EntityMetadata[];
}

const TABLES: ReadonlyArray<readonly [keyof EntityMetadataIndex, EntityMetadataKind, string]> = [
  ['characters', 'character', 'characters'],
  ['weapons', 'weapon', 'weapons'],
  ['summons', 'summon', 'summons'],
];

export const EMPTY_ENTITY_METADATA: EntityMetadataIndex = {
  characters: new Map(),
  weapons: new Map(),
  summons: new Map(),
};

let defaultMetadataPromise: Promise<EntityMetadataIndex> | null = null;

export async function loadWikiEntityMetadata(
  fetcher: FetchLike = fetch,
): Promise<EntityMetadataIndex> {
  if (fetcher !== fetch) return loadWikiEntityMetadataFresh(fetcher);
  if (!defaultMetadataPromise) {
    defaultMetadataPromise = loadWikiEntityMetadataCached(safeLocalStorage(), fetcher)
      .catch((error) => {
        defaultMetadataPromise = null;
        throw error;
      });
  }
  return defaultMetadataPromise;
}

export async function loadWikiEntityMetadataCached(
  storage: StorageLike | undefined,
  fetcher: FetchLike = fetch,
  now = Date.now(),
): Promise<EntityMetadataIndex> {
  const cached = readEntityMetadataCache(storage);
  if (cached && now - cached.cachedAt < WIKI_ENTITY_METADATA_CACHE_TTL_MS) return cached.index;

  try {
    const fresh = await loadWikiEntityMetadataFresh(fetcher);
    writeEntityMetadataCache(storage, fresh, now);
    return fresh;
  } catch (error) {
    if (cached) return cached.index;
    throw error;
  }
}

export function wikiEntityRemoteImageUrl(
  kind: EntityMetadataKind,
  masterId: string,
  wikiTitle?: string,
): string | undefined {
  let filename: string | undefined;
  switch (kind) {
    case 'character':
      if (wikiTitle) filename = `${wikiTitle} iconA.jpg`;
      break;
    case 'weapon':
      filename = `Weapon ls ${masterId}.jpg`;
      break;
    case 'summon':
      filename = `Summon ls ${masterId}.jpg`;
      break;
  }
  if (!filename) return undefined;
  const candidate = `${WIKI_ORIGIN}/Special:Redirect/file/${encodeURIComponent(filename)}`;
  return resolveSafeExternalImageUrl(candidate) ?? undefined;
}

export function wikiEntityImageUrl(
  kind: EntityMetadataKind,
  masterId: string,
  wikiTitle?: string,
): string | undefined {
  return deferWikiImageUrl(wikiEntityRemoteImageUrl(kind, masterId, wikiTitle));
}

async function loadWikiEntityMetadataFresh(fetcher: FetchLike): Promise<EntityMetadataIndex> {
  const entries = await Promise.all(TABLES.map(async ([key, kind, table]) => [
    key,
    await loadCargoTable(table, kind, fetcher),
  ] as const));
  return Object.fromEntries(entries) as unknown as EntityMetadataIndex;
}

async function loadCargoTable(
  table: string,
  kind: EntityMetadataKind,
  fetcher: FetchLike,
): Promise<ReadonlyMap<string, EntityMetadata>> {
  const result = new Map<string, EntityMetadata>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = cargoUrl(table, offset);
    const response = await fetcher(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GBF Wiki metadata request failed (${response.status})`);
    const body = await response.json();
    const rows = cargoRows(body);
    for (const row of rows) {
      const id = text(row.id);
      const wikiTitle = text(row.page ?? row.link ?? row._pageName);
      if (!id || !wikiTitle) continue;
      result.set(id, {
        masterId: id,
        name: wikiTitle,
        wikiTitle,
        imageUrl: wikiEntityImageUrl(kind, id, wikiTitle),
      });
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return result;
}

function readEntityMetadataCache(storage: StorageLike | undefined): { cachedAt: number; index: EntityMetadataIndex } | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(ENTITY_METADATA_CACHE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 1 || typeof value.cachedAt !== 'number' || !Number.isFinite(value.cachedAt)) return undefined;
    const characters = metadataMap(value.characters);
    const weapons = metadataMap(value.weapons);
    const summons = metadataMap(value.summons);
    if (!characters || !weapons || !summons) return undefined;
    return { cachedAt: value.cachedAt, index: { characters, weapons, summons } };
  } catch {
    return undefined;
  }
}

function writeEntityMetadataCache(storage: StorageLike | undefined, index: EntityMetadataIndex, cachedAt: number): void {
  if (!storage) return;
  try {
    const payload: CachedEntityMetadataPayload = {
      version: 1,
      cachedAt,
      characters: [...index.characters.values()],
      weapons: [...index.weapons.values()],
      summons: [...index.summons.values()],
    };
    storage.setItem(ENTITY_METADATA_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Public metadata caching is optional; quota/storage failures fall back to normal loading.
  }
}

function metadataMap(value: unknown): Map<string, EntityMetadata> | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = new Map<string, EntityMetadata>();
  for (const candidate of value) {
    if (!isObject(candidate)) return undefined;
    const masterId = text(candidate.masterId);
    const name = text(candidate.name);
    const wikiTitle = text(candidate.wikiTitle);
    if (!masterId || !name || !wikiTitle) return undefined;
    const imageUrl = normalizeDeferredImageUrl(text(candidate.imageUrl));
    result.set(masterId, {
      masterId,
      name,
      wikiTitle,
      imageUrl,
    });
  }
  return result;
}

function normalizeDeferredImageUrl(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const target = deferredWikiImageTarget(candidate) ?? resolveSafeExternalImageUrl(candidate) ?? undefined;
  return deferWikiImageUrl(target);
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function cargoUrl(table: string, offset: number): URL {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'cargoquery');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('tables', table);
  url.searchParams.set('fields', 'id,_pageName=page');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url;
}

function cargoRows(body: unknown): JsonObject[] {
  if (!isObject(body) || !Array.isArray(body.cargoquery)) return [];
  const rows: JsonObject[] = [];
  for (const value of body.cargoquery) {
    if (!isObject(value)) continue;
    rows.push(isObject(value.title) ? value.title : value);
  }
  return rows;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
