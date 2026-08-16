import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_TREASURE_ICON_CACHE_NAME = 'gbfit:observed-gbf-treasure-icons:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-treasure-icons/';
const TREASURE_ICON_HOST = /^prd-game-[a-z0-9]+-granbluefantasy\.akamaized\.net$/i;
const TREASURE_ICON_PATH = /^\/assets_en\/img\/sp\/assets\/item\/article\/s\/(\d+)\.jpg$/;

type CacheLike = Pick<Cache, 'match' | 'put'>;
type CacheStorageLike = Pick<CacheStorage, 'open' | 'delete'>;

export interface ObservedTreasureIconResponse {
  itemId: string;
  url: string;
  mimeType: 'image/jpeg';
}

export function parseObservedTreasureIconResponse(
  url: string,
  resourceType: string | undefined,
  mimeType: string | undefined,
  status: number | undefined,
): ObservedTreasureIconResponse | null {
  if (resourceType !== 'Image' || status === undefined || status < 200 || status >= 300) return null;
  if (mimeType?.toLowerCase() !== 'image/jpeg') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !TREASURE_ICON_HOST.test(parsed.hostname)) return null;
    const match = TREASURE_ICON_PATH.exec(parsed.pathname);
    const itemId = match?.[1];
    if (!itemId) return null;
    return { itemId, url: parsed.toString(), mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}

export async function storeObservedTreasureIconBody(
  itemId: string,
  body: DebuggerResponseBody,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage || !/^\d+$/.test(itemId) || !body.base64Encoded || !body.body) return false;
  try {
    const bytes = decodeBase64(body.body);
    if (bytes.byteLength === 0) return false;
    const cache = await cacheStorage.open(OBSERVED_TREASURE_ICON_CACHE_NAME);
    await cache.put(treasureIconCacheKey(itemId), new Response(bytes, {
      headers: { 'Content-Type': 'image/jpeg' },
    }));
    return true;
  } catch {
    return false;
  }
}

export async function readObservedTreasureIconBlob(
  itemId: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<Blob | undefined> {
  if (!cacheStorage || !/^\d+$/.test(itemId)) return undefined;
  try {
    const cache = await cacheStorage.open(OBSERVED_TREASURE_ICON_CACHE_NAME);
    const response = await cache.match(treasureIconCacheKey(itemId));
    if (!response?.ok) return undefined;
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType && contentType !== 'image/jpeg') return undefined;
    const blob = await response.blob();
    return blob.size > 0 ? blob : undefined;
  } catch {
    return undefined;
  }
}

export async function clearObservedTreasureIconCache(
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage) return false;
  try {
    return await cacheStorage.delete(OBSERVED_TREASURE_ICON_CACHE_NAME);
  } catch {
    return false;
  }
}

export function treasureIconCacheKey(itemId: string): string {
  return new URL(`${CACHE_KEY_PREFIX}${encodeURIComponent(itemId)}.jpg`, CACHE_KEY_ORIGIN).toString();
}

function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function safeCacheStorage(): CacheStorageLike | undefined {
  try {
    return typeof caches === 'undefined' ? undefined : caches;
  } catch {
    return undefined;
  }
}
