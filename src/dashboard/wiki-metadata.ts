import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const WIKI_ORIGIN = 'https://gbf.wiki';
const PAGE_SIZE = 500;

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

type JsonObject = Record<string, unknown>;

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

export async function loadWikiEntityMetadata(
  fetcher: FetchLike = fetch,
): Promise<EntityMetadataIndex> {
  const entries = await Promise.all(TABLES.map(async ([key, kind, table]) => [
    key,
    await loadCargoTable(table, kind, fetcher),
  ] as const));
  return Object.fromEntries(entries) as unknown as EntityMetadataIndex;
}

export function wikiEntityImageUrl(
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
