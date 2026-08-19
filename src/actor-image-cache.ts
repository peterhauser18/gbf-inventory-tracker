import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_ACTOR_IMAGE_CACHE_NAME = 'gbfit:observed-gbf-actor-images:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-actor-images/';
const ACTOR_IMAGE_HOSTS = new Set([
  'game.granbluefantasy.jp',
  'prd-game-a-granbluefantasy.akamaized.net',
]);
const ACTOR_IMAGE_PATH = /^\/assets(?:_en)?(?:\/\d+)?\/img\/sp\/assets\/(?:leader|npc)\/(s|m|ds)\/([A-Za-z0-9_-]+)\.(?:png|jpe?g|webp)$/i;
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PREFERRED_VARIANTS = ['s', 'm', 'ds'] as const;
const MAX_ENTRIES = 240;

export type ObservedActorImageVariant = typeof PREFERRED_VARIANTS[number];

type CacheLike = Pick<Cache, 'match' | 'put' | 'keys' | 'delete'>;
interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export interface ObservedActorImageResponse {
  assetId: string;
  variant: ObservedActorImageVariant;
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
    const variant = match?.[1]?.toLowerCase() as ObservedActorImageVariant | undefined;
    const assetId = match?.[2];
    if (!assetId || !variant || !PREFERRED_VARIANTS.includes(variant)) return null;
    return { assetId, variant, url: parsed.toString(), mimeType: normalizedMime };
  } catch {
    return null;
  }
}

export async function storeObservedActorImageBody(
  assetId: string,
  variant: ObservedActorImageVariant,
  mimeType: string,
  body: DebuggerResponseBody,
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (
    !cacheStorage ||
    !safeAssetId(assetId) ||
    !PREFERRED_VARIANTS.includes(variant) ||
    !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase()) ||
    !body.base64Encoded ||
    !body.body
  ) return false;
  try {
    const bytes = decodeBase64(body.body);
    if (bytes.byteLength === 0) return false;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const cache = await cacheStorage.open(OBSERVED_ACTOR_IMAGE_CACHE_NAME);
    await cache.put(actorImageCacheKey(assetId, variant), new Response(buffer, {
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
    for (const variant of PREFERRED_VARIANTS) {
      const blob = await readCachedBlob(cache, actorImageCacheKey(assetId, variant));
      if (blob) return blob;
    }
    // Compatibility fallback for actor images cached before variants were keyed separately.
    return await readCachedBlob(cache, legacyActorImageCacheKey(assetId));
  } catch {
    return undefined;
  }
}

export async function clearObservedActorImageCache(
  cacheStorage: CacheStorageLike | undefined = safeCacheStorage(),
): Promise<boolean> {
  if (!cacheStorage) return false;
  try {
    return await cacheStorage.delete(OBSERVED_ACTOR_IMAGE_CACHE_NAME);
  } catch {
    return false;
  }
}

export function actorImageCacheKey(assetId: string, variant: ObservedActorImageVariant = 's'): string {
  return new URL(`${CACHE_KEY_PREFIX}${encodeURIComponent(assetId)}/${variant}`, CACHE_KEY_ORIGIN).toString();
}

async function readCachedBlob(cache: CacheLike, key: string): Promise<Blob | undefined> {
  const response = await cache.match(key);
  if (!response?.ok) return undefined;
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (contentType && !SUPPORTED_MIME_TYPES.has(contentType)) return undefined;
  const blob = await response.blob();
  return blob.size > 0 ? blob : undefined;
}

function legacyActorImageCacheKey(assetId: string): string {
  return new URL(`${CACHE_KEY_PREFIX}${encodeURIComponent(assetId)}`, CACHE_KEY_ORIGIN).toString();
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
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9_-]+$/.test(value);
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
