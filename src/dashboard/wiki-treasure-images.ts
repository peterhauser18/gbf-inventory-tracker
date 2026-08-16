import { resolveSafeExternalImageUrl } from './resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const WIKI_ORIGIN = 'https://gbf.wiki';
const CACHE_KEY = 'gbfit:wiki-treasure-images:v7';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60_000;

export const MAX_WIKI_TREASURE_PAGE_CONCURRENCY = 5;

type FetchLike = typeof fetch;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type JsonObject = Record<string, unknown>;

interface CachedTreasureImageEntry {
  cachedAt: number;
  imageUrl: string;
}

interface CachedTreasureImagePayload {
  version: 7;
  entries: Record<string, CachedTreasureImageEntry>;
}

interface QueueEntry {
  key: string;
  title: string;
  resolve: (value: string | undefined) => void;
  promise: Promise<string | undefined>;
}

export interface WikiTreasureImageResolverOptions {
  fetchImpl?: FetchLike;
  storage?: StorageLike;
  now?: () => number;
  maxConcurrency?: number;
}

export class WikiTreasureImageResolver {
  private readonly fetchImpl: FetchLike;
  private readonly storage?: StorageLike;
  private readonly now: () => number;
  private readonly maxConcurrency: number;
  private readonly cache: Map<string, CachedTreasureImageEntry>;
  private readonly queue: QueueEntry[] = [];
  private readonly pending = new Map<string, QueueEntry>();
  private readonly failedUntil = new Map<string, number>();
  private active = 0;

  constructor(options: WikiTreasureImageResolverOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storage = options.storage ?? (options.fetchImpl ? undefined : safeLocalStorage());
    this.now = options.now ?? Date.now;
    this.maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? MAX_WIKI_TREASURE_PAGE_CONCURRENCY));
    this.cache = readCache(this.storage);
  }

  resolve(title: string): Promise<string | undefined> {
    const cleanedTitle = title.trim();
    if (!cleanedTitle) return Promise.resolve(undefined);
    const key = normalizeWikiTreasureTitle(cleanedTitle);
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.cachedAt < CACHE_TTL_MS) return Promise.resolve(cached.imageUrl);
    if ((this.failedUntil.get(key) ?? 0) > this.now()) return Promise.resolve(undefined);
    const existing = this.pending.get(key);
    if (existing) return existing.promise;

    let resolve!: (value: string | undefined) => void;
    const promise = new Promise<string | undefined>((done) => { resolve = done; });
    const entry: QueueEntry = { key, title: cleanedTitle, resolve, promise };
    this.pending.set(key, entry);
    this.queue.push(entry);
    this.pump();
    return promise;
  }

  private pump(): void {
    while (this.active < this.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.active += 1;
      void this.load(entry).finally(() => {
        this.active -= 1;
        this.pending.delete(entry.key);
        this.pump();
      });
    }
  }

  private async load(entry: QueueEntry): Promise<void> {
    let imageUrl: string | undefined;
    try {
      const response = await this.fetchImpl.call(globalThis, buildWikiTreasurePageImageUrl(entry.title), {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error(`GBF Wiki Treasure page request failed (${response.status})`);
      const body = await response.json() as unknown;
      const payload = isObject(body) ? body : undefined;
      const parsed = payload && isObject(payload.parse) ? payload.parse : undefined;
      const html = parsed && typeof parsed.text === 'string' ? parsed.text : undefined;
      if (html) imageUrl = parseWikiTreasurePageHtml(html, entry.title);
    } catch {
      imageUrl = undefined;
    }

    if (imageUrl) {
      this.cache.set(entry.key, { cachedAt: this.now(), imageUrl });
      writeCache(this.storage, this.cache);
    } else {
      this.failedUntil.set(entry.key, this.now() + FAILURE_COOLDOWN_MS);
    }
    entry.resolve(imageUrl);
  }
}

let defaultResolver: WikiTreasureImageResolver | null = null;

export function loadWikiTreasureImage(title: string): Promise<string | undefined> {
  if (!defaultResolver) defaultResolver = new WikiTreasureImageResolver();
  return defaultResolver.resolve(title);
}

export function buildWikiTreasurePageImageUrl(title: string): string {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', title.trim().replace(/\s+/g, '_'));
  url.searchParams.set('redirects', '1');
  url.searchParams.set('prop', 'text');
  url.searchParams.set('disableeditsection', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function normalizeWikiTreasureTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

export function parseWikiTreasurePageHtml(html: string, title: string): string | undefined {
  const wanted = normalizeWikiTreasureTitle(title);
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)];

  for (const match of images) {
    const attributes = match[1] ?? '';
    const label = imageLabel(attributes);
    if (label && normalizeWikiTreasureTitle(label) === wanted) {
      const imageUrl = safeImageFromAttributes(attributes);
      if (imageUrl) return imageUrl;
    }
  }

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1] ?? '';
    const text = normalizeWikiTreasureTitle(stripHtml(row));
    if (!text.includes(wanted)) continue;
    const imageMatch = row.match(/<img\b([^>]*)>/i);
    if (!imageMatch) continue;
    const imageUrl = safeImageFromAttributes(imageMatch[1] ?? '');
    if (imageUrl) return imageUrl;
  }

  for (const match of images) {
    const attributes = match[1] ?? '';
    const imageUrl = safeImageFromAttributes(attributes);
    if (!imageUrl) continue;
    try {
      const path = decodeURIComponent(new URL(imageUrl).pathname);
      const filename = path.split('/').pop()?.replace(/^\d+px-/, '').replace(/\.(?:jpe?g|png|webp)$/i, '');
      if (filename && normalizeWikiTreasureTitle(filename) === wanted) return imageUrl;
    } catch {
      // Ignore malformed public Wiki markup.
    }
  }

  return undefined;
}

function imageLabel(attributes: string): string | undefined {
  const alt = htmlAttribute(attributes, 'alt');
  const title = htmlAttribute(attributes, 'title');
  return cleanImageLabel(alt) ?? cleanImageLabel(title);
}

function cleanImageLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/^Image:\s*/i, '').replace(/^File:\s*/i, '').trim();
  return cleaned || undefined;
}

function safeImageFromAttributes(attributes: string): string | undefined {
  const candidate = htmlAttribute(attributes, 'src') ?? htmlAttribute(attributes, 'data-src');
  if (!candidate) return undefined;
  try {
    const absolute = new URL(candidate, WIKI_ORIGIN).toString();
    return resolveSafeExternalImageUrl(absolute) ?? undefined;
  } catch {
    return undefined;
  }
}

function htmlAttribute(attributes: string, name: string): string | undefined {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = attributes.match(pattern);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeHtml(value) : undefined;
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function readCache(storage: StorageLike | undefined): Map<string, CachedTreasureImageEntry> {
  const result = new Map<string, CachedTreasureImageEntry>();
  if (!storage) return result;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return result;
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.version !== 7 || !isObject(value.entries)) return result;
    for (const [key, candidate] of Object.entries(value.entries)) {
      if (!isObject(candidate) || typeof candidate.cachedAt !== 'number' || !Number.isFinite(candidate.cachedAt) || typeof candidate.imageUrl !== 'string') continue;
      const safe = resolveSafeExternalImageUrl(candidate.imageUrl);
      if (safe) result.set(normalizeWikiTreasureTitle(key), { cachedAt: candidate.cachedAt, imageUrl: safe });
    }
  } catch {
    // Ignore malformed optional public metadata cache.
  }
  return result;
}

function writeCache(storage: StorageLike | undefined, cache: ReadonlyMap<string, CachedTreasureImageEntry>): void {
  if (!storage) return;
  try {
    const entries: Record<string, CachedTreasureImageEntry> = {};
    for (const [key, entry] of cache) entries[key] = entry;
    const payload: CachedTreasureImagePayload = { version: 7, entries };
    storage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Public Wiki metadata caching is optional.
  }
}

function safeLocalStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
