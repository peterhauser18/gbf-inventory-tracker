import {
  parseWikiObtainRaidSources,
  unavailableWikiSources,
  type WikiMaterialRaidSources,
} from './farming.ts';

const WIKI_SOURCE_CACHE_KEY = 'gbfit:wiki-material-sources:v1';
export const WIKI_SOURCE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

interface CachedWikiSourceEntry {
  cachedAt: number;
  result: WikiMaterialRaidSources;
}

interface CachedWikiSourcesPayload {
  version: 1;
  entries: Record<string, CachedWikiSourceEntry>;
}

export interface WikiMaterialSourceFetchOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageLike;
  now?: number;
}

const inFlightWikiSources = new Map<string, Promise<WikiMaterialRaidSources>>();

export async function loadWikiMaterialRaidSources(
  wikiTitle: string,
  options: WikiMaterialSourceFetchOptions = {},
): Promise<WikiMaterialRaidSources> {
  const title = wikiTitle.trim();
  const sourceUrl = buildWikiMaterialPageUrl(title);
  if (!title) return unavailableWikiSources(title, sourceUrl, 'No Wiki title is available for this material.');

  const fetchImpl = options.fetchImpl ?? fetch;
  const storage = options.storage ?? (options.fetchImpl ? undefined : safeLocalStorage());
  const now = options.now ?? Date.now();
  const key = normalizeTitle(title);
  const cached = readCachedWikiSource(storage, key);
  if (cached && now - cached.cachedAt < WIKI_SOURCE_CACHE_TTL_MS) return cached.result;

  if (!options.fetchImpl) {
    const existing = inFlightWikiSources.get(key);
    if (existing) return existing;
  }

  const request = loadWikiMaterialRaidSourcesFresh(title, fetchImpl)
    .then((result) => {
      if (isCacheableWikiSource(result)) writeCachedWikiSource(storage, key, { cachedAt: now, result });
      return result;
    })
    .catch((error) => {
      if (cached) return cached.result;
      throw error;
    })
    .finally(() => {
      if (!options.fetchImpl) inFlightWikiSources.delete(key);
    });

  if (!options.fetchImpl) inFlightWikiSources.set(key, request);
  return request;
}

async function loadWikiMaterialRaidSourcesFresh(
  title: string,
  fetchImpl: typeof fetch,
): Promise<WikiMaterialRaidSources> {
  const sourceUrl = buildWikiMaterialPageUrl(title);
  try {
    const response = await fetchImpl(buildWikiMaterialApiUrl(title), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return unavailableWikiSources(title, sourceUrl, `GBF Wiki request failed: ${response.status}.`);
    const payload = await response.json() as unknown;
    if (!isObject(payload) || !isObject(payload.parse)) {
      return unavailableWikiSources(title, sourceUrl, 'No structured Wiki page data was returned.');
    }
    const revisionId = numberValue(payload.parse.revid);
    const freshness = revisionId === undefined ? undefined : `revision ${revisionId}`;
    const wikitextObject = isObject(payload.parse.wikitext) ? payload.parse.wikitext : undefined;
    const wikitext = typeof wikitextObject?.['*'] === 'string' ? wikitextObject['*'] : undefined;
    if (!wikitext) {
      return unavailableWikiSources(title, sourceUrl, 'The Wiki page did not expose wikitext for source parsing.', freshness);
    }
    return parseWikiObtainRaidSources(wikitext, title, sourceUrl, freshness);
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    return unavailableWikiSources(title, sourceUrl, `GBF Wiki lookup failed.${detail}`.trim());
  }
}

export function buildWikiMaterialApiUrl(wikiTitle: string): string {
  const url = new URL('https://gbf.wiki/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', wikiTitle);
  url.searchParams.set('prop', 'wikitext|revid');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiMaterialPageUrl(wikiTitle: string): string {
  return `https://gbf.wiki/${encodeURIComponent(wikiTitle.trim().replace(/\s+/g, '_')).replace(/%2F/gi, '/')}`;
}

function readCachedWikiSource(storage: StorageLike | undefined, key: string): CachedWikiSourceEntry | undefined {
  const payload = readCachePayload(storage);
  const entry = payload?.entries[key];
  if (!entry || typeof entry.cachedAt !== 'number' || !Number.isFinite(entry.cachedAt) || !isWikiMaterialRaidSources(entry.result)) return undefined;
  return entry;
}

function writeCachedWikiSource(storage: StorageLike | undefined, key: string, entry: CachedWikiSourceEntry): void {
  if (!storage) return;
  try {
    const payload = readCachePayload(storage) ?? { version: 1 as const, entries: {} };
    payload.entries[key] = entry;
    storage.setItem(WIKI_SOURCE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Public Wiki source caching is optional; storage/quota failures fall back to live lookup.
  }
}

function readCachePayload(storage: StorageLike | undefined): CachedWikiSourcesPayload | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(WIKI_SOURCE_CACHE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 1 || !isObject(value.entries)) return undefined;
    return value as unknown as CachedWikiSourcesPayload;
  } catch {
    return undefined;
  }
}

function isCacheableWikiSource(result: WikiMaterialRaidSources): boolean {
  if (result.state === 'known') return true;
  const limitation = result.limitation ?? '';
  return !limitation.startsWith('GBF Wiki request failed:') && !limitation.startsWith('GBF Wiki lookup failed.');
}

function isWikiMaterialRaidSources(value: unknown): value is WikiMaterialRaidSources {
  if (!isObject(value)) return false;
  if (typeof value.wikiTitle !== 'string' || typeof value.sourceUrl !== 'string') return false;
  if (value.state !== 'known' && value.state !== 'unavailable') return false;
  if (!Array.isArray(value.raids)) return false;
  return value.raids.every((raid) => isObject(raid)
    && typeof raid.name === 'string'
    && typeof raid.target === 'string'
    && typeof raid.sourceUrl === 'string');
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
