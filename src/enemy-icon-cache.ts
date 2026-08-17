import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_ENEMY_ICON_CACHE_NAME = 'gbfit:observed-gbf-enemy-icons:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-enemy-icons/';
const CACHE_ALIAS_PREFIX = '/observed-enemy-icon-aliases/';
const CACHE_RAID_ALIAS_PREFIX = '/observed-raid-boss-icons/';
const ENEMY_ICON_HOST = 'prd-game-a-granbluefantasy.akamaized.net';
const ENEMY_ICON_PATH = /^\/assets(?:_en)?(?:\/\d+)?\/img\/sp\/assets\/enemy\/(?:s|m)\/(\d+)(?:_[^/.]+)?\.(?:png|jpe?g|webp)$/i;
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

export async function rememberObservedEnemyIconAlias(
  enemyId: string,
  assetId: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage || !/^\d+$/.test(enemyId) || !/^\d+$/.test(assetId)) return false;
  try {
    const cache = await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME);
    await cache.put(enemyIconAliasCacheKey(enemyId), new Response(assetId, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    }));
    return true;
  } catch {
    return false;
  }
}

export async function rememberObservedRaidBossIcon(
  raidName: string,
  assetId: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  const key = normalizedRaidName(raidName);
  if (!cacheStorage || !key || !/^\d+$/.test(assetId)) return false;
  try {
    const cache = await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME);
    await cache.put(raidBossIconAliasCacheKey(key), new Response(assetId, {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
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
    const cache = await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME);
    let response = await cache.match(enemyIconCacheKey(enemyId));
    if (!response?.ok) {
      const alias = await readCachedAssetAlias(cache, enemyIconAliasCacheKey(enemyId));
      if (alias) response = await cache.match(enemyIconCacheKey(alias));
    }
    return await responseBlob(response);
  } catch {
    return undefined;
  }
}

export async function readObservedRaidBossIconDataUrl(
  raidName: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<string | undefined> {
  const key = normalizedRaidName(raidName);
  if (!cacheStorage || !key) return undefined;
  try {
    const cache = await cacheStorage.open(OBSERVED_ENEMY_ICON_CACHE_NAME);
    const assetId = await readCachedAssetAlias(cache, raidBossIconAliasCacheKey(key));
    if (!assetId) return undefined;
    const blob = await responseBlob(await cache.match(enemyIconCacheKey(assetId)));
    if (!blob) return undefined;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
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

export function enemyIconAliasCacheKey(enemyId: string): string {
  return new URL(`${CACHE_ALIAS_PREFIX}${encodeURIComponent(enemyId)}`, CACHE_KEY_ORIGIN).toString();
}

export function raidBossIconAliasCacheKey(raidName: string): string {
  return new URL(`${CACHE_RAID_ALIAS_PREFIX}${encodeURIComponent(normalizedRaidName(raidName))}`, CACHE_KEY_ORIGIN).toString();
}

export function raidNameWithoutLevelPrefix(value: string): string {
  return value
    .trim()
    .replace(/^(?:(?:lvl?|level)\.?\s*\d+)\s+/i, '')
    .trim();
}

async function readCachedAssetAlias(cache: CacheLike, key: string): Promise<string | undefined> {
  const response = await cache.match(key);
  if (!response?.ok) return undefined;
  const value = (await response.text()).trim();
  return /^\d+$/.test(value) ? value : undefined;
}

async function responseBlob(response: Response | undefined): Promise<Blob | undefined> {
  if (!response?.ok) return undefined;
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (contentType && !SUPPORTED_MIME_TYPES.has(contentType)) return undefined;
  const blob = await response.blob();
  return blob.size > 0 ? blob : undefined;
}

function normalizedRaidName(value: string): string {
  return raidNameWithoutLevelPrefix(value).toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
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
