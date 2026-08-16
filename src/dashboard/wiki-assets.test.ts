import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WIKI_THUMBNAIL_CACHE_TTL_MS,
  buildWikiThumbnailApiUrl,
  loadWikiMaterialThumbnails,
} from './wiki-assets.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

test('material thumbnails are resolved in one credential-free batch and deduplicated by title', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    return new Response(JSON.stringify({
      query: {
        pages: [
          { pageid: 1, title: 'Harp Stone', thumbnail: { source: 'https://gbf.wiki/images/thumb/a/a1/Harp_Stone.png/48px-Harp_Stone.png' } },
          { pageid: 2, title: "Ewiyar's Jewel", thumbnail: { source: 'https://gbf.wiki/images/thumb/b/b1/Ewiyar%27s_Jewel.png/48px-Ewiyar%27s_Jewel.png' } },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadWikiMaterialThumbnails(['Harp Stone', 'Harp Stone', "Ewiyar's Jewel"], { fetchImpl });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.origin, 'https://gbf.wiki');
  assert.equal(calls[0]?.url.searchParams.get('prop'), 'pageimages');
  assert.equal(calls[0]?.init?.credentials, 'omit');
  assert.equal(calls[0]?.init?.referrerPolicy, 'no-referrer');
  assert.match(result.get('harp stone') ?? '', /^https:\/\/gbf\.wiki\//);
  assert.match(result.get("ewiyar's jewel") ?? '', /^https:\/\/gbf\.wiki\//);
});

test('fresh thumbnail cache avoids another Wiki request', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      query: {
        pages: [{ pageid: 1, title: 'Harp Stone', thumbnail: { source: 'https://gbf.wiki/images/thumb/a/a1/Harp_Stone.png/48px-Harp_Stone.png' } }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const first = await loadWikiMaterialThumbnails(['Harp Stone'], { fetchImpl, storage, now: 10 });
  const second = await loadWikiMaterialThumbnails(['Harp Stone'], {
    fetchImpl,
    storage,
    now: 10 + WIKI_THUMBNAIL_CACHE_TTL_MS - 1,
  });

  assert.equal(calls, 1);
  assert.equal(second.get('harp stone'), first.get('harp stone'));
});

test('an unresolved title is not poisoned into the persistent thumbnail cache', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ query: { pages: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const first = await loadWikiMaterialThumbnails(['Ventus Luster'], { fetchImpl, storage, now: 10 });
  const second = await loadWikiMaterialThumbnails(['Ventus Luster'], { fetchImpl, storage, now: 20 });
  assert.equal(first.has('ventus luster'), false);
  assert.equal(second.has('ventus luster'), false);
  assert.equal(calls, 2);
});

test('a Wiki page that explicitly has no page thumbnail is negatively cached', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      query: { pages: [{ pageid: 1, title: 'Ventus Luster' }] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const first = await loadWikiMaterialThumbnails(['Ventus Luster'], { fetchImpl, storage, now: 10 });
  const second = await loadWikiMaterialThumbnails(['Ventus Luster'], { fetchImpl, storage, now: 20 });
  assert.equal(first.has('ventus luster'), true);
  assert.equal(first.get('ventus luster'), undefined);
  assert.equal(second.has('ventus luster'), true);
  assert.equal(calls, 1);
});

test('thumbnail API URL is a public GBF Wiki query only', () => {
  const url = new URL(buildWikiThumbnailApiUrl(['Harp Stone', 'Gold Brick']));
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.searchParams.get('action'), 'query');
  assert.equal(url.searchParams.get('prop'), 'pageimages');
  assert.equal(url.searchParams.get('titles'), 'Harp Stone|Gold Brick');
  assert.equal(url.searchParams.get('pithumbsize'), '48');
});
