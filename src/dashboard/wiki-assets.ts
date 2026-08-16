import { normalizeWikiTitle } from './farming.ts';
import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_THUMBNAIL_CACHE_KEY = 'gbfit:wiki-material-thumbnails:v2';
const WIKI_API = 'https://gbf.wiki/api.php';
const MAX_TITLES_PER_REQUEST = 50;
export const WIKI_THUMBNAIL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type ThumbnailEntry = {
  cachedAt: number;
  url: string | null;
};

type ThumbnailCachePayload = {
  version: 2;
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

async function fetchThumbnailBatch(
  titles: readonly string[],
  fetchImpl: typeof fetch,
): Promise<Map<string, string | undefined>> {
  const response = await fetchImpl(buildWikiThumbnailApiUrl(titles), {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GBF Wiki thumbnail request failed: ${response.status}`);
  const payload = await response.json() as unknown;
  return parseThumbnailResponse(payload);
}

function parseThumbnailResponse(payload: unknown): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  if (!isObject(payload) || !isObject(payload.query) || !Array.isArray(payload.query.pages)) return result;

  const aliases = new Map<string, string>();
  for (const row of arrayObjects(payload.query.normalized)) {
    if (typeof row.from === 'string' && typeof row.to === 'string') aliases.set(normalizeWikiTitle(row.to), normalizeWikiTitle(row.from));
  }
  for (const row of arrayObjects(payload.query.redirects)) {
    if (typeof row.from === 'string' && typeof row.to === 'string') aliases.set(normalizeWikiTitle(row.to), normalizeWikiTitle(row.from));
  }

  for (const page of payload.query.pages) {
    if (!isObject(page) || typeof page.title !== 'string') continue;
    const canonicalKey = normalizeWikiTitle(page.title);
    const requestedKey = resolveRequestedAlias(canonicalKey, aliases);
    const thumbnail = isObject(page.thumbnail) && typeof page.thumbnail.source === 'string'
      ? resolveSafeExternalImageUrl(page.thumbnail.source) ?? undefined
      : undefined;
    result.set(requestedKey, thumbnail);
    result.set(canonicalKey, thumbnail);
  }
  return result;
}

function resolveRequestedAlias(key: string, aliases: ReadonlyMap<string, string>): string {
  let current = key;
  const seen = new Set<string>();
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = aliases.get(current)!;
  }
  return current;
}

function readThumbnailCache(storage: StorageLike | undefined): ThumbnailCachePayload {
  if (!storage) return { version: 2, entries: {} };
  try {
    const raw = storage.getItem(WIKI_THUMBNAIL_CACHE_KEY);
    if (!raw) return { version: 2, entries: {} };
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 2 || !isObject(value.entries)) return { version: 2, entries: {} };
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
    return { version: 2, entries };
  } catch {
    return { version: 2, entries: {} };
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
