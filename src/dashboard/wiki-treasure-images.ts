import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const TREASURE_CATEGORY = 'Category:Items';
const CACHE_KEY = 'gbfit:wiki-treasure-images:v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type JsonObject = Record<string, unknown>;

interface CachedTreasureImagePayload {
  version: 2;
  cachedAt: number;
  entries: Record<string, string>;
}

export interface WikiTreasureImageLoadOptions {
  fetchImpl?: FetchLike;
  storage?: StorageLike;
  now?: number;
}

let defaultPromise: Promise<ReadonlyMap<string, string>> | null = null;

export async function loadWikiTreasureImageIndex(
  options: WikiTreasureImageLoadOptions = {},
): Promise<ReadonlyMap<string, string>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const storage = options.storage ?? (options.fetchImpl ? undefined : safeLocalStorage());
  const now = options.now ?? Date.now();
  if (options.fetchImpl || options.storage || options.now !== undefined) {
    return loadCached(storage, fetchImpl, now);
  }
  if (!defaultPromise) {
    defaultPromise = loadCached(storage, fetchImpl, now).catch((error) => {
      defaultPromise = null;
      throw error;
    });
  }
  return defaultPromise;
}

export function buildWikiTreasureImageIndexUrl(continueToken?: string): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'categorymembers');
  url.searchParams.set('gcmtitle', TREASURE_CATEGORY);
  url.searchParams.set('gcmtype', 'page');
  url.searchParams.set('gcmlimit', 'max');
  url.searchParams.set('prop', 'pageimages|images');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', '64');
  url.searchParams.set('imlimit', 'max');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  if (continueToken) url.searchParams.set('gcmcontinue', continueToken);
  return url.toString();
}

export function normalizeWikiTreasureTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

async function loadCached(
  storage: StorageLike | undefined,
  fetchImpl: FetchLike,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  const cached = readCache(storage);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.index;
  try {
    const fresh = await loadFresh(fetchImpl);
    writeCache(storage, fresh, now);
    return fresh;
  } catch (error) {
    if (cached) return cached.index;
    throw error;
  }
}

async function loadFresh(fetchImpl: FetchLike): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  let continueToken: string | undefined;
  do {
    const response = await fetchImpl(buildWikiTreasureImageIndexUrl(continueToken), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GBF Wiki treasure image metadata request failed (${response.status})`);
    const body = await response.json();
    const payload = isObject(body) ? body : undefined;
    const query = payload && isObject(payload.query) ? payload.query : undefined;
    if (query && Array.isArray(query.pages)) {
      for (const page of query.pages) {
        if (!isObject(page) || typeof page.title !== 'string') continue;
        const thumbnail = isObject(page.thumbnail) && typeof page.thumbnail.source === 'string'
          ? resolveSafeExternalImageUrl(page.thumbnail.source) ?? undefined
          : undefined;
        const fallback = thumbnail ? undefined : wikiTreasurePageImage(page);
        const imageUrl = thumbnail ?? fallback;
        if (imageUrl) {
          result.set(normalizeWikiTreasureTitle(page.title), imageUrl);
          const itemId = wikiTreasureItemId(imageUrl);
          if (itemId) result.set(normalizeWikiTreasureTitle(`Treasure ${itemId}`), imageUrl);
        }
      }
    }
    const continuation = payload && isObject(payload.continue) ? payload.continue : undefined;
    continueToken = continuation && typeof continuation.gcmcontinue === 'string'
      ? continuation.gcmcontinue
      : undefined;
  } while (continueToken);
  return result;
}

function wikiTreasurePageImage(page: JsonObject): string | undefined {
  if (!Array.isArray(page.images)) return undefined;
  for (const image of page.images) {
    if (!isObject(image) || typeof image.title !== 'string') continue;
    const filename = image.title.replace(/^File:/i, '').trim();
    if (!wikiTreasureItemIdFromFilename(filename)) continue;
    const redirect = `https://gbf.wiki/Special:Redirect/file/${encodeURIComponent(filename)}`;
    return resolveSafeExternalImageUrl(redirect) ?? undefined;
  }
  return undefined;
}

function wikiTreasureItemId(imageUrl: string): string | undefined {
  try {
    const pathname = decodeURIComponent(new URL(imageUrl).pathname);
    return wikiTreasureItemIdFromFilename(pathname);
  } catch {
    return undefined;
  }
}

function wikiTreasureItemIdFromFilename(value: string): string | undefined {
  const match = value.match(/Item_article_s_(\d+)\.(?:jpe?g|png|webp)(?:$|[/?#])/i);
  return match?.[1];
}

function readCache(storage: StorageLike | undefined): { cachedAt: number; index: Map<string, string> } | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 2 || typeof value.cachedAt !== 'number' || !Number.isFinite(value.cachedAt) || !isObject(value.entries)) return undefined;
    const index = new Map<string, string>();
    for (const [key, candidate] of Object.entries(value.entries)) {
      if (typeof candidate !== 'string') continue;
      const safe = resolveSafeExternalImageUrl(candidate);
      if (safe) index.set(normalizeWikiTreasureTitle(key), safe);
    }
    return { cachedAt: value.cachedAt, index };
  } catch {
    return undefined;
  }
}

function writeCache(storage: StorageLike | undefined, index: ReadonlyMap<string, string>, cachedAt: number): void {
  if (!storage) return;
  try {
    const entries: Record<string, string> = {};
    for (const [key, url] of index) entries[key] = url;
    const payload: CachedTreasureImagePayload = { version: 2, cachedAt, entries };
    storage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Public metadata caching is optional.
  }
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
