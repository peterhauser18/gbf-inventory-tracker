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

test('a known technical item id resolves its exact Wiki asset in one additional batched imageinfo read', async () => {
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.searchParams.get('prop') === 'pageimages') {
      return new Response(JSON.stringify({
        query: {
          redirects: [{ from: 'Ventus Luster', to: 'Luster' }],
          pages: [{ pageid: 1, title: 'Luster' }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      query: {
        pages: [{
          pageid: 2,
          title: 'File:Item_article_s_25073.jpg',
          imageinfo: [{ thumburl: 'https://gbf.wiki/images/thumb/a/a7/Item_article_s_25073.jpg/48px-Item_article_s_25073.jpg' }],
        }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadWikiMaterialThumbnails(['Ventus Luster'], {
    fetchImpl,
    itemIdsByTitle: new Map([['ventus luster', '25073']]),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.searchParams.get('prop'), 'pageimages');
  assert.equal(calls[1]?.searchParams.get('prop'), 'imageinfo');
  assert.equal(calls[1]?.searchParams.get('titles'), 'File:Item_article_s_25073.jpg');
  assert.match(result.get('ventus luster') ?? '', /Item_article_s_25073/);
});

test('a weapon page without an inventory item id selects the repeated subject weapon asset generically', async () => {
  const calls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    const prop = url.searchParams.get('prop');
    if (prop === 'pageimages') {
      return new Response(JSON.stringify({
        query: { pages: [{ pageid: 1, title: 'Jade Harp Relic' }] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (prop === 'images') {
      return new Response(JSON.stringify({
        query: {
          pages: [{
            pageid: 1,
            title: 'Jade Harp Relic',
            images: [
              { title: 'File:Weapon s 1030801200.jpg' },
              { title: 'File:Weapon b 1030801500.png' },
              { title: 'File:Weapon ls 1030801500.jpg' },
              { title: 'File:Weapon sp 1030801500.png' },
              { title: 'File:Weapon s 1030801500.jpg' },
              { title: 'File:Weapon m 1030801500.jpg' },
              { title: 'File:Weapon s 1040800700.jpg' },
            ],
          }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      query: {
        pages: [{
          pageid: 2,
          title: 'File:Weapon s 1030801500.jpg',
          imageinfo: [{ thumburl: 'https://gbf.wiki/images/thumb/f/ff/Weapon_s_1030801500.jpg/48px-Weapon_s_1030801500.jpg' }],
        }],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadWikiMaterialThumbnails(['Jade Harp Relic'], { fetchImpl });
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.searchParams.get('prop'), 'pageimages');
  assert.equal(calls[1]?.searchParams.get('prop'), 'images');
  assert.equal(calls[2]?.searchParams.get('prop'), 'imageinfo');
  assert.equal(calls[2]?.searchParams.get('titles'), 'File:Weapon s 1030801500.jpg');
  assert.match(result.get('jade harp relic') ?? '', /1030801500/);
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
  const images = new URL(buildWikiPageImagesApiUrl(['Ventus Luster']));
  const imageInfo = new URL(buildWikiImageInfoApiUrl(['File:Item_article_s_25073.jpg']));

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
