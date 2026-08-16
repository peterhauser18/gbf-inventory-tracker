import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_WIKI_IMAGE_CONCURRENCY,
  WikiImageLoader,
  clearWikiImageCache,
  compareWikiImagePriority,
  deferWikiImageUrl,
  deferredWikiImageTarget,
  shouldQueueWikiImage,
} from './wiki-image-loader.ts';

function imageResponse(body = 'image', status = 200, headers: HeadersInit = { 'Content-Type': 'image/png' }): Response {
  return new Response(body, { status, headers });
}

function fakeCacheStorage() {
  const values = new Map<string, Response>();
  const cache = {
    async match(input: RequestInfo | URL) {
      const key = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return values.get(key)?.clone();
    },
    async put(input: RequestInfo | URL, response: Response) {
      const key = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      values.set(key, response.clone());
    },
    async keys() {
      return [...values.keys()].map((key) => new Request(key));
    },
    async delete(input: RequestInfo | URL) {
      const key = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return values.delete(key);
    },
  };
  return {
    values,
    storage: {
      async open() { return cache as unknown as Cache; },
      async delete() { values.clear(); return true; },
    } as Pick<CacheStorage, 'open' | 'delete'>,
  };
}

const priority = (generation = 1, nearViewport = false) => ({ generation, nearViewport });

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('condition was not reached');
}

test('deferred Wiki image URLs use a transparent sentinel and carry only an approved gbf.wiki target', () => {
  const deferred = deferWikiImageUrl('https://gbf.wiki/images/a.png?x=1#fragment');
  assert.ok(deferred?.startsWith('data:image/gif;base64,'));
  const [dataUrl] = deferred.split('#gbfit-wiki=');
  assert.ok(dataUrl);
  const bytes = Buffer.from(dataUrl.slice('data:image/gif;base64,'.length), 'base64');
  const graphicsControlExtension = bytes.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
  assert.ok(graphicsControlExtension >= 0);
  assert.equal((bytes[graphicsControlExtension + 3] ?? 0) & 0x01, 0x01);
  assert.equal(deferredWikiImageTarget(deferred), 'https://gbf.wiki/images/a.png?x=1');
  assert.equal(deferWikiImageUrl('https://game.granbluefantasy.jp/assets/a.png'), undefined);
  assert.equal(deferredWikiImageTarget('https://gbf.wiki/images/a.png'), undefined);
});

test('progressive draining never exceeds the global max-five network concurrency', async () => {
  assert.equal(MAX_WIKI_IMAGE_CONCURRENCY, 5);
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fetchImpl = (async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await gate;
    active -= 1;
    return imageResponse();
  }) as typeof fetch;
  const loader = new WikiImageLoader({
    fetchImpl,
    cacheStorage: undefined,
    createObjectUrl: (_blob) => `blob:test-${calls}`,
    revokeObjectUrl: () => {},
  });

  const requests = Array.from({ length: 8 }, (_, index) => loader.request(
    `https://gbf.wiki/images/${index}.png`,
    priority(),
  ));
  await waitFor(() => calls === MAX_WIKI_IMAGE_CONCURRENCY);
  assert.equal(maxActive, MAX_WIKI_IMAGE_CONCURRENCY);
  assert.equal(calls, MAX_WIKI_IMAGE_CONCURRENCY);
  release();
  await Promise.all(requests);
  assert.equal(calls, 8);
  assert.equal(maxActive, MAX_WIKI_IMAGE_CONCURRENCY);
});

test('new active-section visible work outranks an older queued background image', async () => {
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let call = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    call += 1;
    const url = String(input);
    order.push(url);
    if (call === 1) await firstGate;
    return imageResponse();
  }) as typeof fetch;
  const loader = new WikiImageLoader({
    fetchImpl,
    cacheStorage: undefined,
    maxConcurrency: 1,
    createObjectUrl: () => `blob:${call}`,
    revokeObjectUrl: () => {},
  });

  const first = loader.request('https://gbf.wiki/images/first.png', priority(1, false));
  const oldBackground = loader.request('https://gbf.wiki/images/old.png', priority(1, false));
  const newVisible = loader.request('https://gbf.wiki/images/new.png', priority(2, true));
  await Promise.resolve();
  releaseFirst();
  await Promise.all([first, oldBackground, newVisible]);
  assert.deepEqual(order, [
    'https://gbf.wiki/images/first.png',
    'https://gbf.wiki/images/new.png',
    'https://gbf.wiki/images/old.png',
  ]);
});

test('duplicate URL requests coalesce and use credential-free no-referrer fetches', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return imageResponse();
  }) as typeof fetch;
  const loader = new WikiImageLoader({
    fetchImpl,
    cacheStorage: undefined,
    createObjectUrl: () => 'blob:deduped',
    revokeObjectUrl: () => {},
  });

  const [left, right] = await Promise.all([
    loader.request('https://gbf.wiki/images/shared.png', priority()),
    loader.request('https://gbf.wiki/images/shared.png', priority(2, true)),
  ]);
  assert.equal(left, 'blob:deduped');
  assert.equal(right, 'blob:deduped');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.credentials, 'omit');
  assert.equal(calls[0]?.init?.referrerPolicy, 'no-referrer');
});

test('a resolved URL is reused in memory on re-render without another network request', async () => {
  let calls = 0;
  const loader = new WikiImageLoader({
    fetchImpl: (async () => { calls += 1; return imageResponse(); }) as typeof fetch,
    cacheStorage: undefined,
    createObjectUrl: () => 'blob:reused',
    revokeObjectUrl: () => {},
  });
  const url = 'https://gbf.wiki/images/rerender.png';
  assert.equal(await loader.request(url, priority()), 'blob:reused');
  assert.equal(await loader.request(url, priority(2, true)), 'blob:reused');
  assert.equal(calls, 1);
});

test('a persistent cache hit in a later loader session performs zero Wiki network calls', async () => {
  const shared = fakeCacheStorage();
  let calls = 0;
  const first = new WikiImageLoader({
    fetchImpl: (async () => { calls += 1; return imageResponse('cached-image'); }) as typeof fetch,
    cacheStorage: shared.storage,
    createObjectUrl: () => 'blob:first',
    revokeObjectUrl: () => {},
  });
  await first.request('https://gbf.wiki/images/cached.png', priority());
  assert.equal(calls, 1);

  const second = new WikiImageLoader({
    fetchImpl: (async () => { throw new Error('network must not run on cache hit'); }) as typeof fetch,
    cacheStorage: shared.storage,
    createObjectUrl: () => 'blob:second',
    revokeObjectUrl: () => {},
  });
  assert.equal(await second.request('https://gbf.wiki/images/cached.png', priority()), 'blob:second');
  assert.equal(calls, 1);
});


test('persistent Wiki image cache exposes a bounded local cleanup path', async () => {
  const shared = fakeCacheStorage();
  shared.values.set('https://gbf.wiki/images/stale.png', imageResponse());
  assert.equal(await clearWikiImageCache(shared.storage), true);
  assert.equal(shared.values.size, 0);
});

test('429 Retry-After establishes a cooldown instead of a retry storm', async () => {
  let now = 1_000;
  let calls = 0;
  const loader = new WikiImageLoader({
    fetchImpl: (async () => {
      calls += 1;
      return imageResponse('', 429, { 'Retry-After': '120' });
    }) as typeof fetch,
    cacheStorage: undefined,
    now: () => now,
    createObjectUrl: () => 'blob:never',
    revokeObjectUrl: () => {},
  });
  const url = 'https://gbf.wiki/images/rate-limited.png';
  assert.equal(await loader.request(url, priority()), undefined);
  assert.equal(await loader.request(url, priority()), undefined);
  assert.equal(calls, 1);
  now += 301_000;
  assert.equal(await loader.request(url, priority()), undefined);
  assert.equal(calls, 2);
});

test('collapsed surfaces are suppressed and priority ordering is deterministic', () => {
  assert.equal(shouldQueueWikiImage(true), false);
  assert.equal(shouldQueueWikiImage(false), true);
  assert.ok(compareWikiImagePriority(priority(3, false), priority(2, true)) < 0);
  assert.ok(compareWikiImagePriority(priority(2, true), priority(2, false)) < 0);
  assert.equal(compareWikiImagePriority(priority(2, true), priority(2, true)), 0);
});
