import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const TREASURE_CATEGORY = 'Category:Items';
const CACHE_KEY = 'gbfit:wiki-treasure-images:v4';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type JsonObject = Record<string, unknown>;

interface CachedTreasureImagePayload {
  version: 4;
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
  if (options.fetchImpl || options.storage || options.now !== undefined) return loadCached(storage, fetchImpl, now);
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
  url.searchParams.set('prop', 'pageimages|images|revisions');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', '64');
  url.searchParams.set('imlimit', 'max');
  url.searchParams.set('rvprop', 'content');
  url.searchParams.set('rvslots', 'main');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  if (continueToken) url.searchParams.set('gcmcontinue', continueToken);
  return url.toString();
}

export function normalizeWikiTreasureTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

async function loadCached(storage: StorageLike | undefined, fetchImpl: FetchLike, now: number): Promise<ReadonlyMap<string, string>> {
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
    const response = await fetchImpl(buildWikiTreasureImageIndexUrl(continueToken), { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`GBF Wiki treasure image metadata request failed (${response.status})`);
    const body = await response.json();
    const payload = isObject(body) ? body : undefined;
    const query = payload && isObject(payload.query) ? payload.query : undefined;
    if (query && Array.isArray(query.pages)) {
      for (const page of query.pages) {
        if (isObject(page) && typeof page.title === 'string') addPageTreasureImages(result, page);
      }
    }
    const continuation = payload && isObject(payload.continue) ? payload.continue : undefined;
    continueToken = continuation && typeof continuation.gcmcontinue === 'string' ? continuation.gcmcontinue : undefined;
  } while (continueToken);
  return result;
}

function addPageTreasureImages(result: Map<string, string>, page: JsonObject): void {
  const pageTitle = typeof page.title === 'string' ? page.title : undefined;
  if (!pageTitle) return;
  const thumbnail = isObject(page.thumbnail) && typeof page.thumbnail.source === 'string'
    ? resolveSafeExternalImageUrl(page.thumbnail.source) ?? undefined
    : undefined;
  const directFallback = thumbnail ? undefined : wikiTreasurePageImage(page);
  const sourceEntries = wikiTreasureSourceEntries(pageTitle, wikiPageSource(page));
  const direct = thumbnail ?? directFallback ?? sourceEntries.get(normalizeWikiTreasureTitle(pageTitle));
  if (direct) addTreasureImage(result, pageTitle, direct);
  for (const [name, imageUrl] of sourceEntries) {
    if (!result.has(name)) result.set(name, imageUrl);
    const itemId = wikiTreasureItemId(imageUrl);
    if (itemId) result.set(normalizeWikiTreasureTitle(`Treasure ${itemId}`), imageUrl);
  }
}

function addTreasureImage(result: Map<string, string>, name: string, imageUrl: string): void {
  result.set(normalizeWikiTreasureTitle(name), imageUrl);
  const itemId = wikiTreasureItemId(imageUrl);
  if (itemId) result.set(normalizeWikiTreasureTitle(`Treasure ${itemId}`), imageUrl);
}

function wikiTreasurePageImage(page: JsonObject): string | undefined {
  if (typeof page.title !== 'string' || !Array.isArray(page.images)) return undefined;
  let namedMatch: string | undefined;
  for (const image of page.images) {
    if (!isObject(image) || typeof image.title !== 'string') continue;
    const filename = image.title.replace(/^File:/i, '').trim();
    const redirect = safeWikiFileRedirect(filename);
    if (!redirect) continue;
    if (wikiTreasureItemIdFromFilename(filename)) return redirect;
    if (!namedMatch && wikiTreasureNamedImageMatches(page.title, filename)) namedMatch = redirect;
  }
  return namedMatch;
}

function wikiTreasureSourceEntries(pageTitle: string, source: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!source) return result;
  for (const block of wikiTemplateBlocks(source)) {
    const names = templateFieldValues(block, /^(?:name|item|title)$/i)
      .map(cleanWikiText)
      .filter((value): value is string => Boolean(value));
    if (names.length !== 1) continue;
    const imageValues = templateFieldValues(block, /^(?:image|icon|img)$/i)
      .map((value) => value.replace(/^File:/i, '').trim())
      .filter((value) => /\.(?:jpe?g|png|webp)$/i.test(value));
    const ids = templateFieldValues(block, /^(?:id|itemid|item_id|item id)$/i)
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));
    let imageUrl: string | undefined;
    if (imageValues.length === 1) imageUrl = safeWikiFileRedirect(imageValues[0]!);
    if (!imageUrl && ids.length === 1) imageUrl = technicalTreasureImageUrl(ids[0]!);
    if (imageUrl) result.set(normalizeWikiTreasureTitle(names[0]!), imageUrl);
  }
  if (!result.has(normalizeWikiTreasureTitle(pageTitle))) {
    const directImages = sourceImageValues(source);
    if (directImages.length === 1) {
      const imageUrl = safeWikiFileRedirect(directImages[0]!);
      if (imageUrl) result.set(normalizeWikiTreasureTitle(pageTitle), imageUrl);
    }
  }
  return result;
}

function wikiTemplateBlocks(source: string): string[] {
  const blocks: string[] = [];
  const stack: number[] = [];
  for (let index = 0; index < source.length - 1; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === '{{') {
      stack.push(index);
      index += 1;
      continue;
    }
    if (pair !== '}}' || stack.length === 0) continue;
    const start = stack.pop();
    if (start !== undefined) blocks.push(source.slice(start, index + 2));
    index += 1;
  }
  return blocks;
}

function templateFieldValues(block: string, keyPattern: RegExp): string[] {
  return sourceFieldValues(block, keyPattern);
}

function sourceFieldValues(source: string, keyPattern: RegExp): string[] {
  const values: string[] = [];
  const pattern = /\|\s*([^=|{}\n]+?)\s*=\s*([^|{}\n]+)/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value && keyPattern.test(key)) values.push(value);
    keyPattern.lastIndex = 0;
  }
  return values;
}

function sourceImageValues(source: string): string[] {
  return sourceFieldValues(source, /^(?:image|icon|img)$/i)
    .map((value) => value.replace(/^File:/i, '').trim())
    .filter((value) => /\.(?:jpe?g|png|webp)$/i.test(value));
}

function cleanWikiText(value: string): string | undefined {
  const link = value.match(/^\[\[(?:[^|\]]+\|)?([^\]]+)\]\]$/);
  const cleaned = (link?.[1] ?? value).replace(/''+/g, '').replace(/<[^>]*>/g, '').trim();
  return cleaned || undefined;
}

function wikiPageSource(page: JsonObject): string | undefined {
  if (!Array.isArray(page.revisions)) return undefined;
  for (const candidate of page.revisions) {
    if (!isObject(candidate)) continue;
    const slots = isObject(candidate.slots) ? candidate.slots : undefined;
    const main = slots && isObject(slots.main) ? slots.main : undefined;
    if (main && typeof main.content === 'string') return main.content;
    if (typeof candidate.content === 'string') return candidate.content;
    if (typeof candidate['*'] === 'string') return candidate['*'];
  }
  return undefined;
}

function safeWikiFileRedirect(filename: string): string | undefined {
  if (!/\.(?:jpe?g|png|webp)$/i.test(filename)) return undefined;
  return resolveSafeExternalImageUrl(`https://gbf.wiki/Special:Redirect/file/${encodeURIComponent(filename)}`) ?? undefined;
}

function technicalTreasureImageUrl(itemId: string): string | undefined {
  return safeWikiFileRedirect(`Item_article_s_${itemId}.jpg`);
}

function wikiTreasureNamedImageMatches(pageTitle: string, filename: string): boolean {
  const stem = filename.replace(/\.(?:jpe?g|png|webp)$/i, '');
  return normalizeWikiTreasureTitle(stem) === normalizeWikiTreasureTitle(pageTitle);
}

function wikiTreasureItemId(imageUrl: string): string | undefined {
  try {
    return wikiTreasureItemIdFromFilename(decodeURIComponent(new URL(imageUrl).pathname));
  } catch {
    return undefined;
  }
}

function wikiTreasureItemIdFromFilename(value: string): string | undefined {
  return value.match(/Item_article_s_(\d+)\.(?:jpe?g|png|webp)(?:$|[/?#])/i)?.[1];
}

function readCache(storage: StorageLike | undefined): { cachedAt: number; index: Map<string, string> } | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 4 || typeof value.cachedAt !== 'number' || !Number.isFinite(value.cachedAt) || !isObject(value.entries)) return undefined;
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
    const payload: CachedTreasureImagePayload = { version: 4, cachedAt, entries };
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
