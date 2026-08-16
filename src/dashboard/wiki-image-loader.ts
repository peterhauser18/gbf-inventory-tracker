import { resolveSafeExternalImageUrl } from './resolver.ts';
import { loadWikiTreasureImageIndex, normalizeWikiTreasureTitle } from './wiki-treasure-images.ts';

export const MAX_WIKI_IMAGE_CONCURRENCY = 5;
export const WIKI_IMAGE_CACHE_NAME = 'gbfit:wiki-images:v1';
export const WIKI_IMAGE_CACHE_MAX_ENTRIES = 1200;

const CACHE_PRUNE_INTERVAL = 32;
const FAILURE_COOLDOWN_MS = 60_000;
const RATE_LIMIT_COOLDOWN_MS = 5 * 60_000;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const DEFERRED_MARKER = '#gbfit-wiki=';

type CacheLike = Pick<Cache, 'match' | 'put' | 'keys' | 'delete'>;
type CacheStorageLike = Pick<CacheStorage, 'open' | 'delete'>;

export interface WikiImagePriority {
  generation: number;
  nearViewport: boolean;
}

interface QueueEntry {
  key: string;
  priority: WikiImagePriority;
  sequence: number;
  resolve: (value: string | undefined) => void;
  promise: Promise<string | undefined>;
}

export interface WikiImageLoaderOptions {
  fetchImpl?: typeof fetch;
  cacheStorage?: CacheStorageLike;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  now?: () => number;
  maxConcurrency?: number;
  maxPersistentEntries?: number;
}

export class WikiImageLoader {
  private readonly fetchImpl: typeof fetch;
  private readonly cacheStorage?: CacheStorageLike;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly now: () => number;
  private readonly maxConcurrency: number;
  private readonly maxPersistentEntries: number;
  private readonly queue: QueueEntry[] = [];
  private readonly pending = new Map<string, QueueEntry>();
  private readonly loaded = new Map<string, string>();
  private readonly failedUntil = new Map<string, number>();
  private active = 0;
  private sequence = 0;
  private cachePromise: Promise<CacheLike | undefined> | null = null;
  private cacheWrites = 0;

  constructor(options: WikiImageLoaderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheStorage = options.cacheStorage ?? safeCacheStorage();
    this.createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    this.revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.now = options.now ?? Date.now;
    this.maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? MAX_WIKI_IMAGE_CONCURRENCY));
    this.maxPersistentEntries = Math.max(1, Math.floor(options.maxPersistentEntries ?? WIKI_IMAGE_CACHE_MAX_ENTRIES));
  }

  request(candidate: string, priority: WikiImagePriority): Promise<string | undefined> {
    const key = normalizeWikiImageUrl(candidate);
    if (!key) return Promise.resolve(undefined);

    const loaded = this.loaded.get(key);
    if (loaded) return Promise.resolve(loaded);
    if ((this.failedUntil.get(key) ?? 0) > this.now()) return Promise.resolve(undefined);

    const existing = this.pending.get(key);
    if (existing) {
      if (compareWikiImagePriority(priority, existing.priority) < 0) existing.priority = priority;
      return existing.promise;
    }

    let resolve!: (value: string | undefined) => void;
    const promise = new Promise<string | undefined>((done) => { resolve = done; });
    const entry: QueueEntry = {
      key,
      priority,
      sequence: this.sequence++,
      resolve,
      promise,
    };
    this.pending.set(key, entry);
    this.queue.push(entry);
    this.pump();
    return promise;
  }

  dispose(): void {
    for (const url of this.loaded.values()) this.revokeObjectUrl(url);
    this.loaded.clear();
  }

  private pump(): void {
    this.queue.sort(compareQueueEntries);
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.active += 1;
      void this.resolveEntry(entry).finally(() => {
        this.active -= 1;
        this.pending.delete(entry.key);
        this.pump();
      });
    }
  }

  private async resolveEntry(entry: QueueEntry): Promise<void> {
    let result: string | undefined;
    try {
      result = await this.load(entry.key);
    } catch {
      this.failedUntil.set(entry.key, this.now() + FAILURE_COOLDOWN_MS);
    }
    entry.resolve(result);
  }

  private async load(key: string): Promise<string | undefined> {
    const cache = await this.openCache();
    const cached = await safeCacheMatch(cache, key);
    if (cached?.ok) {
      const objectUrl = await this.responseObjectUrl(cached, key);
      if (objectUrl) return objectUrl;
      await safeCacheDelete(cache, key);
    }

    let response: Response;
    try {
      response = await this.fetchImpl.call(globalThis, key, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      this.failedUntil.set(key, this.now() + FAILURE_COOLDOWN_MS);
      return undefined;
    }

    if (!response.ok) {
      this.failedUntil.set(key, this.now() + responseCooldown(response, this.now()));
      return undefined;
    }

    const finalUrl = response.url ? normalizeWikiImageUrl(response.url) : key;
    if (!finalUrl) {
      this.failedUntil.set(key, this.now() + FAILURE_COOLDOWN_MS);
      return undefined;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      this.failedUntil.set(key, this.now() + FAILURE_COOLDOWN_MS);
      return undefined;
    }

    if (cache) {
      try {
        await cache.put(key, response.clone());
        this.cacheWrites += 1;
        if (this.cacheWrites === 1 || this.cacheWrites % CACHE_PRUNE_INTERVAL === 0) void this.pruneCache(cache);
      } catch {
        // Persistent caching is an optimization; a successful image can still render from memory.
      }
    }

    return this.responseObjectUrl(response, key);
  }

  private async responseObjectUrl(response: Response, key: string): Promise<string | undefined> {
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.toLowerCase().startsWith('image/')) return undefined;
      const blob = await response.blob();
      if (!blob.size) return undefined;
      const objectUrl = this.createObjectUrl(blob);
      this.loaded.set(key, objectUrl);
      return objectUrl;
    } catch {
      return undefined;
    }
  }

  private openCache(): Promise<CacheLike | undefined> {
    if (!this.cacheStorage) return Promise.resolve(undefined);
    if (!this.cachePromise) {
      this.cachePromise = this.cacheStorage.open(WIKI_IMAGE_CACHE_NAME)
        .then((cache) => cache)
        .catch(() => undefined);
    }
    return this.cachePromise;
  }

  private async pruneCache(cache: CacheLike): Promise<void> {
    try {
      const keys = await cache.keys();
      const excess = keys.length - this.maxPersistentEntries;
      if (excess <= 0) return;
      for (const request of keys.slice(0, excess)) await cache.delete(request);
    } catch {
      // Storage pressure can evict Cache Storage independently; pruning must never break rendering.
    }
  }
}

export function deferWikiImageUrl(candidate: string | undefined): string | undefined {
  const target = normalizeWikiImageUrl(candidate);
  return target ? `${TRANSPARENT_PIXEL}${DEFERRED_MARKER}${encodeURIComponent(target)}` : undefined;
}

export function deferredWikiImageTarget(candidate: string | null | undefined): string | undefined {
  if (!candidate?.startsWith('data:image/')) return undefined;
  const markerIndex = candidate.indexOf(DEFERRED_MARKER);
  if (markerIndex < 0) return undefined;
  try {
    return normalizeWikiImageUrl(decodeURIComponent(candidate.slice(markerIndex + DEFERRED_MARKER.length)));
  } catch {
    return undefined;
  }
}

export function compareWikiImagePriority(left: WikiImagePriority, right: WikiImagePriority): number {
  if (left.generation !== right.generation) return right.generation - left.generation;
  if (left.nearViewport !== right.nearViewport) return left.nearViewport ? -1 : 1;
  return 0;
}

export function shouldQueueWikiImage(hiddenByCollapsedSurface: boolean): boolean {
  return !hiddenByCollapsedSurface;
}

export async function clearWikiImageCache(cacheStorage: CacheStorageLike | undefined = safeCacheStorage()): Promise<boolean> {
  if (!cacheStorage) return false;
  try {
    return await cacheStorage.delete(WIKI_IMAGE_CACHE_NAME);
  } catch {
    return false;
  }
}

let domInstalled = false;
let domLoader: WikiImageLoader | null = null;
let scanQueued = false;
let scopeKey = '';
let scopeGeneration = 0;
let treasureHydration: Promise<void> | null = null;
let imageAssignmentGuardInstalled = false;

export function installWikiImageDomLoader(): void {
  if (domInstalled || typeof document === 'undefined' || typeof window === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;
  domInstalled = true;
  installWikiImageAssignmentGuard();
  domLoader = new WikiImageLoader();

  const observer = new MutationObserver(() => scheduleDomScan());
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'open'] });
  document.addEventListener('toggle', scheduleDomScan, true);
  window.addEventListener('scroll', scheduleDomScan, { passive: true });
  window.addEventListener('resize', scheduleDomScan, { passive: true });
  window.addEventListener('pagehide', () => domLoader?.dispose(), { once: true });
  scheduleDomScan();
}

function installWikiImageAssignmentGuard(): void {
  if (imageAssignmentGuardInstalled || typeof HTMLImageElement === 'undefined') return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!descriptor?.get || !descriptor.set) return;
  imageAssignmentGuardInstalled = true;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value: string) {
      const guarded = deferWikiImageUrl(value) ?? value;
      descriptor.set!.call(this, guarded);
    },
  });
}

function scheduleDomScan(): void {
  if (scanQueued) return;
  scanQueued = true;
  queueMicrotask(() => {
    scanQueued = false;
    scanDom();
  });
}

function scanDom(): void {
  if (!domLoader || typeof document === 'undefined') return;
  const nextScope = activeDashboardScope();
  if (nextScope !== scopeKey) {
    scopeKey = nextScope;
    scopeGeneration += 1;
  }

  void hydrateTreasureVisuals();

  const candidates = Array.from(document.querySelectorAll<HTMLImageElement>('img[src*="#gbfit-wiki="]'))
    .flatMap((image) => {
      const target = deferredWikiImageTarget(image.getAttribute('src'));
      if (!target || !shouldQueueWikiImage(isHiddenByCollapsedSurface(image))) return [];
      return [{ image, target, nearViewport: isNearViewport(image) }];
    })
    .sort((left, right) => Number(right.nearViewport) - Number(left.nearViewport));

  for (const candidate of candidates) {
    const sentinel = candidate.image.getAttribute('src');
    candidate.image.style.opacity = '0';
    void domLoader.request(candidate.target, {
      generation: scopeGeneration,
      nearViewport: candidate.nearViewport,
    }).then((objectUrl) => {
      if (!objectUrl || !candidate.image.isConnected || candidate.image.getAttribute('src') !== sentinel) return;
      candidate.image.style.removeProperty('opacity');
      candidate.image.src = objectUrl;
    });
  }
}

async function hydrateTreasureVisuals(): Promise<void> {
  if (treasureHydration || typeof document === 'undefined') return;
  const visuals = Array.from(document.querySelectorAll<HTMLElement>('.entity-visual.treasure'))
    .filter((visual) => !visual.querySelector('img') && visual.dataset.wikiTreasureImage !== 'attempted');
  if (visuals.length === 0) return;

  treasureHydration = loadWikiTreasureImageIndex()
    .then((index) => {
      for (const visual of visuals) {
        if (!visual.isConnected || visual.querySelector('img')) continue;
        visual.dataset.wikiTreasureImage = 'attempted';
        const title = treasureVisualTitle(visual);
        if (!title) continue;
        const remoteUrl = index.get(normalizeWikiTreasureTitle(title));
        const deferred = deferWikiImageUrl(remoteUrl);
        if (!deferred) continue;
        const image = document.createElement('img');
        image.dataset.entityImage = 'true';
        image.src = deferred;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        visual.append(image);
      }
    })
    .catch(() => {})
    .finally(() => {
      treasureHydration = null;
      scheduleDomScan();
    });
  await treasureHydration;
}

function treasureVisualTitle(visual: HTMLElement): string | undefined {
  const card = visual.closest<HTMLElement>('.entity-card');
  const cardTitle = card?.querySelector<HTMLElement>('.card-copy > strong')?.textContent?.trim();
  if (cardTitle) return cardTitle;
  return visual.closest<HTMLElement>('.detail-panel')?.querySelector<HTMLElement>('.detail-title h3')?.textContent?.trim() || undefined;
}

function activeDashboardScope(): string {
  const active = document.querySelector<HTMLElement>('.nav-item.active[data-section]')?.dataset.section;
  if (active) return active;
  if (document.querySelector('[data-goals-view]')) return 'goals';
  return 'dashboard';
}

function isHiddenByCollapsedSurface(image: Element): boolean {
  if (image.closest('[hidden]')) return true;
  for (let element = image.parentElement; element; element = element.parentElement) {
    if (element instanceof HTMLDetailsElement && !element.open) return true;
  }
  return false;
}

function isNearViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const margin = 320;
  return rect.bottom >= -margin
    && rect.top <= window.innerHeight + margin
    && rect.right >= -margin
    && rect.left <= window.innerWidth + margin;
}

function compareQueueEntries(left: QueueEntry, right: QueueEntry): number {
  return compareWikiImagePriority(left.priority, right.priority) || left.sequence - right.sequence;
}

function normalizeWikiImageUrl(candidate: string | undefined): string | undefined {
  const safe = resolveSafeExternalImageUrl(candidate);
  if (!safe) return undefined;
  const url = new URL(safe);
  url.hash = '';
  return url.toString();
}

function safeCacheStorage(): CacheStorageLike | undefined {
  try {
    return typeof caches === 'undefined' ? undefined : caches;
  } catch {
    return undefined;
  }
}

async function safeCacheMatch(cache: CacheLike | undefined, key: string): Promise<Response | undefined> {
  if (!cache) return undefined;
  try {
    return await cache.match(key) ?? undefined;
  } catch {
    return undefined;
  }
}

async function safeCacheDelete(cache: CacheLike | undefined, key: string): Promise<void> {
  if (!cache) return;
  try {
    await cache.delete(key);
  } catch {
    // Ignore corrupt/evicted cache entries.
  }
}

function responseCooldown(response: Response, now: number): number {
  if (response.status !== 429) return FAILURE_COOLDOWN_MS;
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (!retryAfter) return RATE_LIMIT_COOLDOWN_MS;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(RATE_LIMIT_COOLDOWN_MS, seconds * 1000);
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.max(RATE_LIMIT_COOLDOWN_MS, date - now) : RATE_LIMIT_COOLDOWN_MS;
}