import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWikiTreasurePageImageUrl,
  MAX_WIKI_TREASURE_PAGE_CONCURRENCY,
  parseWikiTreasurePageHtml,
  WikiTreasureImageResolver,
} from './wiki-treasure-images.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('condition was not reached');
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Treasure metadata requests the concrete public Wiki page and follows redirects', () => {
  const url = new URL(buildWikiTreasurePageImageUrl('Fire Crystal'));
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.pathname, '/api.php');
  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('page'), 'Fire_Crystal');
  assert.equal(url.searchParams.get('redirects'), '1');
  assert.equal(url.searchParams.get('prop'), 'text');
  assert.equal(url.searchParams.has('ids'), false);
});

test('Treasure page HTML resolves normal and grouped-page images by the concrete item label', () => {
  const normal = `
    <div class="infobox">
      <a href="/File:Item_article_s_125.jpg">
        <img alt="Gray Sandstone" src="/images/a/aa/Item_article_s_125.jpg">
      </a>
    </div>`;
  assert.equal(
    parseWikiTreasurePageHtml(normal, 'Gray Sandstone'),
    'https://gbf.wiki/images/a/aa/Item_article_s_125.jpg',
  );

  const grouped = `
    <div>
      <img alt="Fire Crystal" src="/images/f/fire/Fire_Crystal.jpg">
      <img alt="Water Crystal" src="/images/w/water/Water_Crystal.jpg">
      <img alt="Earth Crystal" src="/images/e/earth/Earth_Crystal.jpg">
    </div>`;
  assert.equal(
    parseWikiTreasurePageHtml(grouped, 'Water Crystal'),
    'https://gbf.wiki/images/w/water/Water_Crystal.jpg',
  );

  const unsafe = '<img alt="Gray Sandstone" src="https://game.granbluefantasy.jp/assets/item.png">';
  assert.equal(parseWikiTreasurePageHtml(unsafe, 'Gray Sandstone'), undefined);
});

test('Treasure page resolver uses the browser fetch receiver and never exceeds five concurrent page requests', async () => {
  assert.equal(MAX_WIKI_TREASURE_PAGE_CONCURRENCY, 5);
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const releases: Array<() => void> = [];

  const fetchImpl = (async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    assert.equal(this, globalThis);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    const page = new URL(input.toString()).searchParams.get('page')?.replace(/_/g, ' ') ?? 'Treasure';
    return jsonResponse({
      parse: { text: `<img alt="${page}" src="https://gbf.wiki/images/${encodeURIComponent(page)}.jpg">` },
    });
  }) as typeof fetch;

  const resolver = new WikiTreasureImageResolver({ fetchImpl, storage: memoryStorage() });
  const promises = Array.from({ length: 8 }, (_, index) => resolver.resolve(`Treasure ${index}`));

  await waitFor(() => calls === 5);
  assert.equal(maxActive, 5);
  while (releases.length) releases.shift()?.();
  await waitFor(() => calls === 8);
  while (releases.length) releases.shift()?.();

  const results = await Promise.all(promises);
  assert.equal(results.filter(Boolean).length, 8);
  assert.equal(maxActive, 5);
});

test('successful Treasure page image mappings persist and avoid a repeated Wiki page request', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async function (this: unknown) {
    assert.equal(this, globalThis);
    calls += 1;
    return jsonResponse({
      parse: {
        text: '<img alt="Gray Sandstone" src="https://gbf.wiki/images/a/aa/Item_article_s_125.jpg">',
      },
    });
  }) as typeof fetch;

  const firstResolver = new WikiTreasureImageResolver({ fetchImpl, storage, now: () => 10 });
  const first = await firstResolver.resolve('Gray Sandstone');
  assert.equal(first, 'https://gbf.wiki/images/a/aa/Item_article_s_125.jpg');
  assert.equal(calls, 1);

  const secondResolver = new WikiTreasureImageResolver({ fetchImpl, storage, now: () => 20 });
  const second = await secondResolver.resolve('Gray Sandstone');
  assert.equal(second, first);
  assert.equal(calls, 1);
});
