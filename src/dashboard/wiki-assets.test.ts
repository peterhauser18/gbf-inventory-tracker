import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WIKI_THUMBNAIL_CACHE_TTL_MS,
  buildWikiImageInfoApiUrl,
  buildWikiPageImagesApiUrl,
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

test('shared Wiki pages resolve a specifically named material image in two additional batched reads', async () => {
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const prop = url.searchParams.get('prop');
    if (prop === 'pageimages') {
      return new Response(JSON.stringify({
        query: {
          redirects: [{ from: 'Aqua Luster', to: 'Lusters' }],
          pages: [{ pageid: 1, title: 'Lusters' }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (prop === 'images') {
      return new Response(JSON.stringify({
        query: {
          redirects: [{ from: 'Aqua Luster', to: 'Lusters' }],
          pages: [{
            pageid: 1,
            title: 'Lusters',
            images: [
              { title: 'File:Terra Luster.png' },
              { title: 'File:Aqua Luster.png' },
              { title: 'File:Ventus Luster.png' },
            ],
          }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      query: {
        pages: [{
          pageid: 2,
          title: 'File:Aqua Luster.png',
          imageinfo: [{ thumburl: 'https://gbf.wiki/images/thumb/a/a1/Aqua_Luster.png/48px-Aqua_Luster.png' }],
        }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadWikiMaterialThumbnails(['Aqua Luster'], { fetchImpl });
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.searchParams.get('prop'), 'pageimages');
  assert.equal(calls[1]?.searchParams.get('prop'), 'images');
  assert.equal(calls[2]?.searchParams.get('prop'), 'imageinfo');
  assert.match(result.get('aqua luster') ?? '', /Aqua_Luster/);
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

  const first = await loadWikiMaterialThumbnails(['Unknown Material'], { fetchImpl, storage, now: 10 });
  const second = await loadWikiMaterialThumbnails(['Unknown Material'], { fetchImpl, storage, now: 20 });
  assert.equal(first.has('unknown material'), false);
  assert.equal(second.has('unknown material'), false);
  assert.equal(calls, 4, 'each attempt uses pageimages plus one shared-page image discovery batch');
});

test('a Wiki page with no matching page or embedded material image is negatively cached', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    calls += 1;
    const url = new URL(String(input));
    if (url.searchParams.get('prop') === 'pageimages') {
      return new Response(JSON.stringify({
        query: { pages: [{ pageid: 1, title: 'Fixture Material' }] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      query: { pages: [{ pageid: 1, title: 'Fixture Material', images: [{ title: 'File:Unrelated.png' }] }] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const first = await loadWikiMaterialThumbnails(['Fixture Material'], { fetchImpl, storage, now: 10 });
  const second = await loadWikiMaterialThumbnails(['Fixture Material'], { fetchImpl, storage, now: 20 });
  assert.equal(first.has('fixture material'), true);
  assert.equal(first.get('fixture material'), undefined);
  assert.equal(second.has('fixture material'), true);
  assert.equal(calls, 2);
});

test('thumbnail and fallback API URLs are public GBF Wiki queries only', () => {
  const thumbnail = new URL(buildWikiThumbnailApiUrl(['Harp Stone', 'Gold Brick']));
  const images = new URL(buildWikiPageImagesApiUrl(['Aqua Luster']));
  const imageInfo = new URL(buildWikiImageInfoApiUrl(['File:Aqua Luster.png']));

  assert.equal(thumbnail.origin, 'https://gbf.wiki');
  assert.equal(thumbnail.searchParams.get('action'), 'query');
  assert.equal(thumbnail.searchParams.get('prop'), 'pageimages');
  assert.equal(thumbnail.searchParams.get('titles'), 'Harp Stone|Gold Brick');
  assert.equal(thumbnail.searchParams.get('pithumbsize'), '48');

  assert.equal(images.origin, 'https://gbf.wiki');
  assert.equal(images.searchParams.get('prop'), 'images');
  assert.equal(images.searchParams.get('imlimit'), 'max');

  assert.equal(imageInfo.origin, 'https://gbf.wiki');
  assert.equal(imageInfo.searchParams.get('prop'), 'imageinfo');
  assert.equal(imageInfo.searchParams.get('iiurlwidth'), '48');
});
