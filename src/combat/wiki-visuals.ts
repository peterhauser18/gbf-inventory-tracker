import { deferWikiImageUrl } from '../dashboard/wiki-image-loader.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const WIKI_ORIGIN = 'https://gbf.wiki';
const CACHE_KEY = 'gbfit:wiki-combat-visuals:v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CombatWikiAssetKind = 'character' | 'boss';

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'json'>>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type CachedVisual = {
  cachedAt: number;
  filename?: string;
};

type VisualCache = Record<string, CachedVisual>;

const pending = new Map<string, Promise<string | undefined>>();

export function combatWikiAssetCandidateFilenames(
  kind: CombatWikiAssetKind,
  assetId: string,
): string[] {
  const safeId = safeAssetId(assetId);
  if (!safeId) return [];
  if (kind === 'boss') {
    return [
      `Enemy_Icon_${safeId}_S.png`,
      `Enemy_Icon_${safeId}_M.png`,
      `Enemy_Icon_${safeId}_L.png`,
      `Quest_l_${safeId}.jpg`,
      `Quest_l_${safeId}.png`,
      `Enemy_s_${safeId}.png`,
      `Enemy_m_${safeId}.png`,
    ];
  }
  return [
    `Npc_s_${safeId}.png`,
    `Npc_s_${safeId}.jpg`,
    `Leader_pm_${safeId}.png`,
    `Leader_pm_${safeId}.jpg`,
    `Leader_s_${safeId}.png`,
  ];
}

export function resolveWikiCombatAssetImage(
  kind: CombatWikiAssetKind,
  assetId: string,
  fetcher: FetchLike = fetch,
  storage: StorageLike | undefined = safeLocalStorage(),
  now = Date.now(),
): Promise<string | undefined> {
  const safeId = safeAssetId(assetId);
  if (!safeId) return Promise.resolve(undefined);
  const key = `${kind}:${safeId}`;
  const cached = readCache(storage)[key];
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.filename ? deferredFileUrl(cached.filename) : undefined);
  }
  const existing = pending.get(key);
  if (existing) return existing;

  const request = resolveFresh(kind, safeId, fetcher)
    .then((filename) => {
      writeCacheEntry(storage, key, { cachedAt: now, filename });
      return filename ? deferredFileUrl(filename) : undefined;
    })
    .catch(() => undefined)
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

async function resolveFresh(
  kind: CombatWikiAssetKind,
  assetId: string,
  fetcher: FetchLike,
): Promise<string | undefined> {
  const candidates = combatWikiAssetCandidateFilenames(kind, assetId);
  if (!candidates.length) return undefined;
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  url.searchParams.set('titles', candidates.map((filename) => `File:${filename}`).join('|'));

  const response = await fetcher(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) return undefined;
  const body = await response.json();
  if (!isObject(body) || !isObject(body.query) || !Array.isArray(body.query.pages)) return undefined;

  const found = new Map<string, string>();
  for (const page of body.query.pages) {
    if (!isObject(page) || 'missing' in page) continue;
    const title = text(page.title);
    if (!title?.toLowerCase().startsWith('file:')) continue;
    const filename = title.slice(5);
    found.set(normalizeFilename(filename), filename);
  }
  for (const candidate of candidates) {
    const filename = found.get(normalizeFilename(candidate));
    if (filename) return filename;
  }
  return undefined;
}

function deferredFileUrl(filename: string): string | undefined {
  const candidate = `${WIKI_ORIGIN}/Special:Redirect/file/${encodeURIComponent(filename)}`;
  return deferWikiImageUrl(candidate);
}

function readCache(storage: StorageLike | undefined): VisualCache {
  if (!storage) return {};
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return {};
    const cache: VisualCache = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isObject(value) || typeof value.cachedAt !== 'number' || !Number.isFinite(value.cachedAt)) continue;
      const filename = text(value.filename);
      cache[key] = { cachedAt: value.cachedAt, filename };
    }
    return cache;
  } catch {
    return {};
  }
}

function writeCacheEntry(storage: StorageLike | undefined, key: string, entry: CachedVisual): void {
  if (!storage) return;
  try {
    const cache = readCache(storage);
    cache[key] = entry;
    storage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Public visual metadata caching is optional.
  }
}

function safeAssetId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 80 && /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function normalizeFilename(value: string): string {
  return value.replace(/_/g, ' ').trim().toLowerCase();
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
