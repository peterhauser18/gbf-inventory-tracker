export const WIKI_CARGO_API = 'https://gbf.wiki/api.php';
export const WIKI_CARGO_PAGE_SIZE = 500;
export const CHARACTER_SKILL_CARGO_FIELDS = 'character_id,_pageName=page,ix,type,name,description,sort_order';

export type WikiCargoRow = Record<string, unknown>;
export type WikiCargoFetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const defaultLoads = new Map<string, Promise<WikiCargoRow[]>>();

export function loadWikiCharacterSkillRows(
  fetcher: WikiCargoFetchLike = fetch,
): Promise<WikiCargoRow[]> {
  return loadWikiCargoRows('character_skills', CHARACTER_SKILL_CARGO_FIELDS, fetcher);
}

export function loadWikiCargoRows(
  table: string,
  fields: string,
  fetcher: WikiCargoFetchLike = fetch,
): Promise<WikiCargoRow[]> {
  if (fetcher !== fetch) return loadWikiCargoRowsFresh(table, fields, fetcher);

  const key = `${table}|${fields}`;
  const existing = defaultLoads.get(key);
  if (existing) return existing;

  const pending = loadWikiCargoRowsFresh(table, fields, fetcher).catch((error) => {
    defaultLoads.delete(key);
    throw error;
  });
  defaultLoads.set(key, pending);
  return pending;
}

async function loadWikiCargoRowsFresh(
  table: string,
  fields: string,
  fetcher: WikiCargoFetchLike,
): Promise<WikiCargoRow[]> {
  const rows: WikiCargoRow[] = [];
  for (let offset = 0; ; offset += WIKI_CARGO_PAGE_SIZE) {
    const url = cargoUrl(table, fields, offset);
    const response = await fetcher(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GBF Wiki Cargo request failed (${table}: ${response.status})`);

    const pageRows = cargoRows(await response.json());
    if (!pageRows) throw new Error(`GBF Wiki Cargo response was not a row set (${table})`);
    rows.push(...pageRows);
    if (pageRows.length < WIKI_CARGO_PAGE_SIZE) break;
  }
  return rows;
}

function cargoUrl(table: string, fields: string, offset: number): URL {
  const url = new URL(WIKI_CARGO_API);
  url.searchParams.set('action', 'cargoquery');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('tables', table);
  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', String(WIKI_CARGO_PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url;
}

function cargoRows(body: unknown): WikiCargoRow[] | undefined {
  if (!isObject(body) || !Array.isArray(body.cargoquery)) return undefined;
  const rows: WikiCargoRow[] = [];
  for (const value of body.cargoquery) {
    if (!isObject(value)) continue;
    rows.push(isObject(value.title) ? value.title : value);
  }
  return rows;
}

function isObject(value: unknown): value is WikiCargoRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
