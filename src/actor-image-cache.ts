import type { DebuggerResponseBody } from './capture/types.ts';

export const OBSERVED_ACTOR_IMAGE_CACHE_NAME = 'gbfit:observed-gbf-actor-images:v1';
const CACHE_KEY_ORIGIN = 'https://gbfit.local';
const CACHE_KEY_PREFIX = '/observed-actor-images/';
const ACTOR_IMAGE_HOSTS = new Set([
  'game.granbluefantasy.jp',
  'prd-game-a-granbluefantasy.akamaized.net',
]);
const COMPACT_ACTOR_IMAGE_PATH = /^\/assets(?:_en)?(?:\/\d+)?\/img\/sp\/assets\/(?:leader|npc)\/s\/([A-Za-z0-9_-]+)\.(?:png|jpe?g|webp)$/i;
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
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
    const assetId = COMPACT_ACTOR_IMAGE_PATH.exec(parsed.pathname)?.[1];
    if (!assetId) return null;
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
    const response = await cache.match(actorImageCacheKey(assetId));
    if (!response?.ok) return undefined;
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType && !SUPPORTED_MIME_TYPES.has(contentType)) return undefined;
    const blob = await response.blob();
    return blob.size > 0 ? blob : undefined;
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

export function actorImageCacheKey(assetId: string): string {
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
