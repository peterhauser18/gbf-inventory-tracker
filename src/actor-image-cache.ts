import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_ACTOR_IMAGE_CACHE_NAME = 'gbfit:observed-gbf-actor-images:v2';
const LEGACY_OBSERVED_ACTOR_IMAGE_CACHE_NAME = 'gbfit:observed-gbf-actor-images:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-actor-images/';
const ACTOR_IMAGE_HOSTS = new Set([
  'game.granbluefantasy.jp',
  'prd-game-a-granbluefantasy.akamaized.net',
]);
const ACTOR_IMAGE_PATH = /^\/assets(?:_en)?(?:\/\d+)?\/img\/sp\/assets\/(leader|npc)\/(s|m|ds)\/([A-Za-z0-9_-]+)\.(?:png|jpe?g|webp)$/i;
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LEADER_FALLBACK_VARIANTS = ['m', 'ds'] as const;
const MAX_ENTRIES = 240;

type CacheLike = Pick<Cache, 'match' | 'put' | 'keys' | 'delete'>;
interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export interface ObservedActorImageResponse {
  assetId: string;
  url: string;
  mimeType: string;
}

export function parseObservedActorImageResponse(
  url: string,
  resourceType: string | undefined,
  mimeType: string | undefined,
  status: number | undefined,
): ObservedActorImageResponse | null {
  if (resourceType !== 'Image' || status !== 200) return null;
  const normalizedMime = mimeType?.toLowerCase();
  if (!normalizedMime || !SUPPORTED_MIME_TYPES.has(normalizedMime)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ACTOR_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    const match = ACTOR_IMAGE_PATH.exec(parsed.pathname);
    const family = match?.[1]?.toLowerCase();
    const variant = match?.[2]?.toLowerCase();
    const observedAssetId = match?.[3];
    if (!family || !variant || !observedAssetId) return null;

    // NPC `s` is the compact GBF party/combat asset. Reject larger NPC variants so
    // they cannot overwrite the card-sized portrait in the local cache. MC/leader
    // may only be observed as a larger local variant, so retain those under a
    // fallback-only cache id while still preferring `leader/s` when it exists.
    if (family === 'npc' && variant !== 's') return null;
    const assetId = family === 'leader' && variant !== 's'
      ? leaderFallbackAssetId(observedAssetId, variant)
      : observedAssetId;
    return { assetId, url: parsed.toString(), mimeType: normalizedMime };
  } catch {
    return null;
  }
}

export async function storeObservedActorImageBody(
  assetId: string,
  mimeType: string,
  body: DebuggerResponseBody,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (
    !cacheStorage ||
    !safeAssetId(assetId) ||
    !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase()) ||
    !body.base64Encoded ||
    !body.body
  ) return false;
  try {
    const bytes = decodeBase64(body.body);
    if (bytes.byteLength === 0) return false;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const cache = await cacheStorage.open(OBSERVED_ACTOR_IMAGE_CACHE_NAME);
    await cache.put(actorImageCacheKey(assetId), new Response(buffer, {
      headers: { 'Content-Type': mimeType.toLowerCase() },
    }));
    await prune(cache);
    return true;
  } catch {
    return false;
  }
}

export async function readObservedActorImageBlob(
  assetId: string,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<Blob | undefined> {
  if (!cacheStorage || !safeAssetId(assetId)) return undefined;
  try {
    const cache = await cacheStorage.open(OBSERVED_ACTOR_IMAGE_CACHE_NAME);
    const preferred = await readCachedBlob(cache, actorImageCacheKey(assetId));
    if (preferred) return preferred;
    for (const variant of LEADER_FALLBACK_VARIANTS) {
      const fallback = await readCachedBlob(cache, actorImageCacheKey(leaderFallbackAssetId(assetId, variant)));
      if (fallback) return fallback;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function clearObservedActorImageCache(
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage) return false;
  try {
    const [current, legacy] = await Promise.all([
      cacheStorage.delete(OBSERVED_ACTOR_IMAGE_CACHE_NAME),
      cacheStorage.delete(LEGACY_OBSERVED_ACTOR_IMAGE_CACHE_NAME),
    ]);
    return current || legacy;
  } catch {
    return false;
  }
}

export function actorImageCacheKey(assetId: string): string {
  return new URL(`${CACHE_KEY_PREFIX}${encodeURIComponent(assetId)}`, CACHE_KEY_ORIGIN).toString();
}

async function readCachedBlob(cache: CacheLike, key: string): Promise<Blob | undefined> {
  const response = await cache.match(key);
  if (!response?.ok) return undefined;
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (contentType && !SUPPORTED_MIME_TYPES.has(contentType)) return undefined;
  const blob = await response.blob();
  return blob.size > 0 ? blob : undefined;
}

function leaderFallbackAssetId(assetId: string, variant: string): string {
  return `leader_${variant}_${assetId}`;
}

async function prune(cache: CacheLike): Promise<void> {
  try {
    const keys = await cache.keys();
    const excess = keys.length - MAX_ENTRIES;
    if (excess <= 0) return;
    for (const request of keys.slice(0, excess)) await cache.delete(request);
  } catch {
    // Cache pruning is optional and must never interrupt passive observation.
  }
}

function safeAssetId(value: string): boolean {
  return value.length > 0 && value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value);
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
