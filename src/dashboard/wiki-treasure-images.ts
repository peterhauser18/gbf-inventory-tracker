import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const WIKI_ORIGIN = 'https://gbf.wiki';
// The old Items page carries grouped entries (for example orbs/crystals); Category:Items supplies newer item pages it omits.
const TREASURE_INDEX_PAGE = 'Items';
const TREASURE_CATEGORY = 'Category:Items';
const CACHE_KEY = 'gbfit:wiki-treasure-images:v6';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type JsonObject = Record<string, unknown>;

interface CachedTreasureImagePayload {
  version: 6;
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

export function buildWikiTreasureImageIndexUrl(): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', TREASURE_INDEX_PAGE);
  url.searchParams.set('prop', 'text');
  url.searchParams.set('disableeditsection', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiTreasureCategoryImageUrl(continueToken?: string): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'categorymembers');
  url.searchParams.set('gcmtitle', TREASURE_CATEGORY);
  url.searchParams.set('gcmtype', 'page');
  url.searchParams.set('gcmlimit', 'max');
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail|name');
  url.searchParams.set('pithumbsize', '64');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  if (continueToken) url.searchParams.set('gcmcontinue', continueToken);
  return url.toString();
}

export function normalizeWikiTreasureTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

export function parseWikiTreasureItemsHtml(html: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = match[1];
    if (!row) continue;
    const name = treasureNameFromRow(row);
    const imageUrl = treasureImageFromRow(row);
    if (name && imageUrl) result.set(normalizeWikiTreasureTitle(name), imageUrl);
  }
  return result;
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
  const response = await fetchImpl.call(globalThis, buildWikiTreasureImageIndexUrl(), {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error(`GBF Wiki treasure image metadata request failed (${response.status})`);
  const body = await response.json();
  const payload = isObject(body) ? body : undefined;
  const parsed = payload && isObject(payload.parse) ? payload.parse : undefined;
  const html = parsed && typeof parsed.text === 'string' ? parsed.text : undefined;
  if (!html) throw new Error('GBF Wiki Items page did not return rendered HTML');

  const result = new Map(parseWikiTreasureItemsHtml(html));
  const categoryImages = await loadCategoryPageImages(fetchImpl);
  for (const [name, imageUrl] of categoryImages) {
    if (!result.has(name)) result.set(name, imageUrl);
  }
  return result;
}

async function loadCategoryPageImages(fetchImpl: FetchLike): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();
  let continueToken: string | undefined;
  do {
    const response = await fetchImpl.call(globalThis, buildWikiTreasureCategoryImageUrl(continueToken), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GBF Wiki treasure category metadata request failed (${response.status})`);
    const body = await response.json();
    const payload = isObject(body) ? body : undefined;
    const query = payload && isObject(payload.query) ? payload.query : undefined;
    if (query && Array.isArray(query.pages)) {
      for (const page of query.pages) {
        if (!isObject(page) || typeof page.title !== 'string') continue;
        const thumbnail = isObject(page.thumbnail) && typeof page.thumbnail.source === 'string'
          ? resolveSafeExternalImageUrl(page.thumbnail.source) ?? undefined
          : undefined;
        const pageImage = typeof page.pageimage === 'string'
          ? safeWikiFileRedirect(page.pageimage)
          : undefined;
        const imageUrl = thumbnail ?? pageImage;
        if (imageUrl) result.set(normalizeWikiTreasureTitle(page.title), imageUrl);
      }
    }
    const continuation = payload && isObject(payload.continue) ? payload.continue : undefined;
    continueToken = continuation && typeof continuation.gcmcontinue === 'string'
      ? continuation.gcmcontinue
      : undefined;
  } while (continueToken);
  return result;
}

function treasureNameFromRow(row: string): string | undefined {
  for (const match of row.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] ?? '';
    const href = htmlAttribute(attributes, 'href');
    if (!href || !wikiArticleTitle(href)) continue;
    const text = stripHtml(match[2] ?? '');
    if (text) return text;
  }
  for (const match of row.matchAll(/<img\b([^>]*)>/gi)) {
    const alt = htmlAttribute(match[1] ?? '', 'alt');
    if (alt && normalizeWikiTreasureTitle(alt) !== 'image') return alt;
  }
  return undefined;
}

function treasureImageFromRow(row: string): string | undefined {
  for (const match of row.matchAll(/<img\b([^>]*)>/gi)) {
    const src = htmlAttribute(match[1] ?? '', 'src');
    if (!src) continue;
    try {
      const absolute = new URL(src, WIKI_ORIGIN).toString();
      const safe = resolveSafeExternalImageUrl(absolute);
      if (safe) return safe;
    } catch {
      // Ignore malformed image URLs in public Wiki markup.
    }
  }
  return undefined;
}

function wikiArticleTitle(href: string): string | undefined {
  try {
    const url = new URL(href, WIKI_ORIGIN);
    if (url.origin !== WIKI_ORIGIN) return undefined;
    let title: string | undefined;
    if (url.pathname.startsWith('/index.php')) title = url.searchParams.get('title') ?? undefined;
    else if (url.pathname.startsWith('/')) title = decodeURIComponent(url.pathname.slice(1));
    if (!title || title.includes(':')) return undefined;
    return normalizeWikiTreasureTitle(title) === 'items' ? undefined : title.replace(/_/g, ' ');
  } catch {
    return undefined;
  }
}

function safeWikiFileRedirect(filename: string): string | undefined {
  if (!/\.(?:jpe?g|png|webp)$/i.test(filename)) return undefined;
  const candidate = `${WIKI_ORIGIN}/Special:Redirect/file/${encodeURIComponent(filename)}`;
  return resolveSafeExternalImageUrl(candidate) ?? undefined;
}

function htmlAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = attributes.match(pattern);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeHtml(value) : undefined;
}

function stripHtml(value: string): string | undefined {
  const text = decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function readCache(storage: StorageLike | undefined): { cachedAt: number; index: Map<string, string> } | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 6 || typeof value.cachedAt !== 'number' || !Number.isFinite(value.cachedAt) || !isObject(value.entries)) return undefined;
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
    const payload: CachedTreasureImagePayload = { version: 6, cachedAt, entries };
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
