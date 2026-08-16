import { normalizeWikiTitle } from './farming.ts';
import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_THUMBNAIL_CACHE_KEY = 'gbfit:wiki-material-thumbnails:v3';
const WIKI_API = 'https://gbf.wiki/api.php';
const MAX_TITLES_PER_REQUEST = 50;
export const WIKI_THUMBNAIL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type ThumbnailEntry = {
  cachedAt: number;
  url: string | null;
};

type ThumbnailCachePayload = {
  version: 3;
  entries: Record<string, ThumbnailEntry>;
};

type ThumbnailBatchResult = {
  ok: boolean;
  thumbnails: Map<string, string | undefined>;
};

type ThumbnailResolution = {
  resolved: boolean;
  url?: string;
};

type QueryAliases = {
  normalized: Map<string, string>;
  redirects: Map<string, string>;
};

export interface WikiThumbnailLoadOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageLike;
  now?: number;
}

const inFlightByTitle = new Map<string, Promise<ThumbnailResolution>>();

export async function loadWikiMaterialThumbnails(
  wikiTitles: readonly string[],
  options: WikiThumbnailLoadOptions = {},
): Promise<ReadonlyMap<string, string | undefined>> {
  const requested = new Map<string, string>();
  for (const raw of wikiTitles) {
    const title = raw.trim();
    if (!title) continue;
    requested.set(normalizeWikiTitle(title), title);
  }
  if (requested.size === 0) return new Map();

  const fetchImpl = options.fetchImpl ?? fetch;
  const storage = options.storage ?? (options.fetchImpl ? undefined : safeLocalStorage());
  const now = options.now ?? Date.now();
  const cache = readThumbnailCache(storage);
  const result = new Map<string, string | undefined>();
  const pending = new Map<string, Promise<ThumbnailResolution>>();
  const toFetch: Array<{ key: string; title: string }> = [];

  for (const [key, title] of requested) {
    const cached = cache.entries[key];
    if (cached && now - cached.cachedAt < WIKI_THUMBNAIL_CACHE_TTL_MS) {
      result.set(key, cached.url ?? undefined);
      continue;
    }
    const inFlight = inFlightByTitle.get(key);
    if (inFlight) pending.set(key, inFlight);
    else toFetch.push({ key, title });
  }

  for (let offset = 0; offset < toFetch.length; offset += MAX_TITLES_PER_REQUEST) {
    const batch = toFetch.slice(offset, offset + MAX_TITLES_PER_REQUEST);
    const batchPromise: Promise<ThumbnailBatchResult> = fetchThumbnailBatch(batch.map((entry) => entry.title), fetchImpl)
      .then((thumbnails) => ({ ok: true, thumbnails }))
      .catch(() => ({ ok: false, thumbnails: new Map<string, string | undefined>() }));

    for (const entry of batch) {
      const promise = batchPromise.then(({ ok, thumbnails }): ThumbnailResolution => {
        if (!ok || !thumbnails.has(entry.key)) return { resolved: false };
        const url = thumbnails.get(entry.key);
        writeThumbnailCacheEntry(storage, entry.key, { cachedAt: now, url: url ?? null });
        return { resolved: true, url };
      }).finally(() => {
        inFlightByTitle.delete(entry.key);
      });
      inFlightByTitle.set(entry.key, promise);
      pending.set(entry.key, promise);
    }
  }

  await Promise.all([...pending.entries()].map(async ([key, promise]) => {
    const resolution = await promise;
    if (resolution.resolved) result.set(key, resolution.url);
  }));
  return result;
}

export function buildWikiThumbnailApiUrl(wikiTitles: readonly string[]): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', '48');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('titles', wikiTitles.join('|'));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiPageImagesApiUrl(wikiTitles: readonly string[]): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'images');
  url.searchParams.set('imlimit', 'max');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('titles', wikiTitles.join('|'));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiImageInfoApiUrl(fileTitles: readonly string[]): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url');
  url.searchParams.set('iiurlwidth', '48');
  url.searchParams.set('titles', fileTitles.join('|'));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
}

async function fetchThumbnailBatch(
  titles: readonly string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, string | undefined>> {
  const response = await fetchImpl(buildWikiThumbnailApiUrl(titles), publicWikiRequestInit());
  if (!response.ok) throw new Error(`GBF Wiki thumbnail request failed: ${response.status}`);
  const payload = await response.json() as unknown;
  const thumbnails = parseThumbnailResponse(payload, titles);
  const fallbackTitles = titles.filter((title) => !thumbnails.get(normalizeWikiTitle(title)));
  if (fallbackTitles.length === 0) return thumbnails;

  const fallback = await fetchSharedPageImageFallback(fallbackTitles, fetchImpl);
  for (const [key, url] of fallback) thumbnails.set(key, url);
  return thumbnails;
}

async function fetchSharedPageImageFallback(
  titles: readonly string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, string>> {
  const pageResponse = await fetchImpl(buildWikiPageImagesApiUrl(titles), publicWikiRequestInit());
  if (!pageResponse.ok) return new Map();
  const pagePayload = await pageResponse.json() as unknown;
  const filesByRequestedTitle = selectMaterialImageFiles(pagePayload, titles);
  if (filesByRequestedTitle.size === 0) return new Map();

  const fileTitles = [...new Set(filesByRequestedTitle.values())];
  const imageResponse = await fetchImpl(buildWikiImageInfoApiUrl(fileTitles), publicWikiRequestInit());
  if (!imageResponse.ok) return new Map();
  const imagePayload = await imageResponse.json() as unknown;
  const urlsByFile = parseImageInfoResponse(imagePayload);
  const result = new Map<string, string>();
  for (const [requestedKey, fileTitle] of filesByRequestedTitle) {
    const url = urlsByFile.get(normalizeWikiTitle(fileTitle));
    if (url) result.set(requestedKey, url);
  }
  return result;
}

function publicWikiRequestInit(): RequestInit {
  return {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  };
}

function parseThumbnailResponse(
  payload: unknown,
  requestedTitles: readonly string[],
): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  const query = queryObject(payload);
  if (!query || !Array.isArray(query.pages)) return result;

  const aliases = queryAliases(query);
  const pages = new Map<string, Record<string, any>>();
  for (const page of query.pages) {
    if (!isObject(page) || typeof page.title !== 'string') continue;
    pages.set(normalizeWikiTitle(page.title), page);
  }

  for (const rawTitle of requestedTitles) {
    const requestedKey = normalizeWikiTitle(rawTitle);
    const canonicalKey = resolveCanonicalKey(requestedKey, aliases);
    const page = pages.get(canonicalKey);
    if (!page) continue;
    const thumbnail = isObject(page.thumbnail) && typeof page.thumbnail.source === 'string'
      ? resolveSafeExternalImageUrl(page.thumbnail.source) ?? undefined
      : undefined;
    result.set(requestedKey, thumbnail);
  }
  return result;
}

function selectMaterialImageFiles(
  payload: unknown,
  requestedTitles: readonly string[],
): Map<string, string> {
  const result = new Map<string, string>();
  const query = queryObject(payload);
  if (!query || !Array.isArray(query.pages)) return result;

  const aliases = queryAliases(query);
  const pages = new Map<string, Record<string, any>>();
  for (const page of query.pages) {
    if (!isObject(page) || typeof page.title !== 'string') continue;
    pages.set(normalizeWikiTitle(page.title), page);
  }

  for (const rawTitle of requestedTitles) {
    const requestedKey = normalizeWikiTitle(rawTitle);
    const canonicalKey = resolveCanonicalKey(requestedKey, aliases);
    const page = pages.get(canonicalKey);
    if (!page || !Array.isArray(page.images)) continue;
    const imageTitles = page.images
      .filter(isObject)
      .map((image) => typeof image.title === 'string' ? image.title : '')
      .filter(Boolean);
    const selected = selectBestMaterialImageFile(rawTitle, imageTitles);
    if (selected) result.set(requestedKey, selected);
  }
  return result;
}

function selectBestMaterialImageFile(materialTitle: string, imageTitles: readonly string[]): string | undefined {
  const materialTokens = assetTokens(materialTitle);
  if (materialTokens.length === 0) return undefined;
  const materialCompact = materialTokens.join('');
  const ranked = imageTitles
    .map((fileTitle) => ({ fileTitle, score: materialImageScore(materialTokens, materialCompact, fileTitle) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.fileTitle.localeCompare(right.fileTitle));
  if (ranked.length === 0) return undefined;
  if (ranked.length > 1 && ranked[0]!.score === ranked[1]!.score) return undefined;
  return ranked[0]!.fileTitle;
}

function materialImageScore(materialTokens: readonly string[], materialCompact: string, fileTitle: string): number {
  const fileTokens = assetTokens(fileTitle).filter((token) => token !== 'item' && token !== 'icon' && token !== 'thumb');
  if (fileTokens.length === 0) return 0;
  const fileCompact = fileTokens.join('');
  if (fileCompact === materialCompact) return 1000;
  if (fileCompact.includes(materialCompact)) return 900 - Math.min(100, fileTokens.length - materialTokens.length);
  if (!materialTokens.every((token) => fileTokens.includes(token))) return 0;
  return 800 - Math.min(100, fileTokens.length - materialTokens.length);
}

function assetTokens(value: string): string[] {
  return value
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseImageInfoResponse(payload: unknown): Map<string, string> {
  const result = new Map<string, string>();
  const query = queryObject(payload);
  if (!query || !Array.isArray(query.pages)) return result;
  for (const page of query.pages) {
    if (!isObject(page) || typeof page.title !== 'string' || !Array.isArray(page.imageinfo)) continue;
    const info = page.imageinfo.find(isObject);
    if (!info) continue;
    const candidate = typeof info.thumburl === 'string'
      ? info.thumburl
      : typeof info.url === 'string'
        ? info.url
        : undefined;
    const safe = resolveSafeExternalImageUrl(candidate);
    if (safe) result.set(normalizeWikiTitle(page.title), safe);
  }
  return result;
}

function queryObject(payload: unknown): Record<string, any> | undefined {
  return isObject(payload) && isObject(payload.query) ? payload.query : undefined;
}

function queryAliases(query: Record<string, any>): QueryAliases {
  const normalized = new Map<string, string>();
  const redirects = new Map<string, string>();
  for (const row of arrayObjects(query.normalized)) {
    if (typeof row.from === 'string' && typeof row.to === 'string') {
      normalized.set(normalizeWikiTitle(row.from), normalizeWikiTitle(row.to));
    }
  }
  for (const row of arrayObjects(query.redirects)) {
    if (typeof row.from === 'string' && typeof row.to === 'string') {
      redirects.set(normalizeWikiTitle(row.from), normalizeWikiTitle(row.to));
    }
  }
  return { normalized, redirects };
}

function resolveCanonicalKey(key: string, aliases: QueryAliases): string {
  let current = key;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    const next = aliases.normalized.get(current) ?? aliases.redirects.get(current);
    if (!next) break;
    current = next;
  }
  return current;
}

function readThumbnailCache(storage: StorageLike | undefined): ThumbnailCachePayload {
  if (!storage) return { version: 3, entries: {} };
  try {
    const raw = storage.getItem(WIKI_THUMBNAIL_CACHE_KEY);
    if (!raw) return { version: 3, entries: {} };
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 3 || !isObject(value.entries)) return { version: 3, entries: {} };
    const entries: Record<string, ThumbnailEntry> = {};
    for (const [key, candidate] of Object.entries(value.entries)) {
      if (!isObject(candidate) || typeof candidate.cachedAt !== 'number' || !Number.isFinite(candidate.cachedAt)) continue;
      const url = candidate.url === null
        ? null
        : typeof candidate.url === 'string'
          ? resolveSafeExternalImageUrl(candidate.url)
          : null;
      entries[key] = { cachedAt: candidate.cachedAt, url };
    }
    return { version: 3, entries };
  } catch {
    return { version: 3, entries: {} };
  }
}

function writeThumbnailCacheEntry(storage: StorageLike | undefined, key: string, entry: ThumbnailEntry): void {
  if (!storage) return;
  try {
    const payload = readThumbnailCache(storage);
    payload.entries[key] = entry;
    storage.setItem(WIKI_THUMBNAIL_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Thumbnail caching is an optional public-metadata optimization.
  }
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function arrayObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
