import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_ENEMY_ICON_CACHE_NAME = 'gbfit:observed-gbf-enemy-icons:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-enemy-icons/';
const ENEMY_ICON_HOST = 'prd-game-a-granbluefantasy.akamaized.net';
const ENEMY_ICON_PATH = /^\/assets(?:_en)?\/img\/sp\/assets\/enemy\/(?:s|m)\/(\d+)(?:_[^/.]+)?\.(?:png|jpe?g|webp)$/i;
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type CacheLike = Pick<Cache, 'match' | 'put'>;
interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export interface ObservedEnemyIconResponse {
  enemyId: string;
  url: string;
  mimeType: string;
}

export function parseObservedEnemyIconResponse(
  url: string,
  resourceType: string | undefined,
  mimeType: string | undefined,
  status: number | undefined,
): ObservedEnemyIconResponse | null {
  if (resourceType !== 'Image' || status !== 200) return null;
  const normalizedMime = mimeType?.toLowerCase();
  if (!normalizedMime || !SUPPORTED_MIME_TYPES.has(normalizedMime)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== ENEMY_ICON_HOST) return null;
    const enemyId = ENEMY_ICON_PATH.exec(parsed.pathname)?.[1];
    if (!enemyId) return null;
    return { enemyId, url: parsed.toString(), mimeType: normalizedMime };
  } catch {
    return null;
  }
}

export async function storeObservedEnemyIconBody(
  enemyId: string,
  mimeType: string,
  body: DebuggerResponseBody,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (
    !cacheStorage ||
    !/^\d+$/.test(enemyId) ||
    !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase()) ||
    !body.base64Encoded ||
    !body.body
  ) return false;
  try {
    const bytes = decodeBase64(body.body);
    if (bytes.byteLength === 0) return false;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const cache = await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME);
    await cache.put(enemyIconCacheKey(enemyId), new Response(buffer, {
      headers: { 'Content-Type': mimeType.toLowerCase() },
    }));
    return true;
  } catch {
    return false;
  }
}

export async function readObservedEnemyIconBlob(
  enemyId: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<Blob | undefined> {
  if (!cacheStorage || !/^\d+$/.test(enemyId)) return undefined;
  try {
    const response = await (await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME)).match(enemyIconCacheKey(enemyId));
    if (!response?.ok) return undefined;
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType && !SUPPORTED_MIME_TYPES.has(contentType)) return undefined;
    const blob = await response.blob();
    return blob.size > 0 ? blob : undefined;
  } catch {
    return undefined;
  }
}

export async function clearObservedEnemyIconCache(
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage) return false;
  try {
    return await cacheStorage.delete(OBSERVED_ENEMY_ICON_CACHE_NAME);
  } catch {
    return false;
  }
}

export function enemyIconCacheKey(enemyId: string): string {
  return new URL(`${CACHE_KEY_PREFIX}${encodeURIComponent(enemyId)}`, CACHE_KEY_ORIGIN).toString();
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
