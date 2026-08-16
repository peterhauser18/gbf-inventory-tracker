import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWikiTreasureImageIndexUrl,
  loadWikiTreasureImageIndex,
} from './wiki-treasure-images.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

test('treasure image metadata uses one fixed account-independent Category:Items generator query', () => {
  const url = new URL(buildWikiTreasureImageIndexUrl());
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.pathname, '/api.php');
  assert.equal(url.searchParams.get('generator'), 'categorymembers');
  assert.equal(url.searchParams.get('gcmtitle'), 'Category:Items');
  assert.equal(url.searchParams.get('gcmtype'), 'page');
  assert.equal(url.searchParams.get('prop'), 'pageimages|images');
  assert.equal(url.searchParams.get('imlimit'), 'max');
  assert.equal(url.searchParams.has('titles'), false);
  assert.equal(url.searchParams.has('where'), false);
  assert.equal(url.searchParams.has('ids'), false);
});

test('treasure image index follows public continuation and uses technical or page-title image fallbacks', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    const continued = url.searchParams.has('gcmcontinue');
    return {
      ok: true,
      status: 200,
      json: async () => continued ? ({
        query: { pages: [
          { title: 'Gold Brick', thumbnail: { source: 'https://gbf.wiki/images/Item_article_s_10.jpg' } },
          {
            title: 'Satin Feather',
            images: [
              { title: 'File:Decorative_banner.png' },
              { title: 'File:Satin_Feather.jpg' },
            ],
          },
          { title: 'Unsafe Item', thumbnail: { source: 'https://game.granbluefantasy.jp/assets/item.png' } },
        ] },
      }) : ({
        continue: { gcmcontinue: 'page|next', continue: '-||' },
        query: { pages: [
          {
            title: 'Harp Stone',
            images: [
              { title: 'File:Harp_Stone.jpg' },
              { title: 'File:Item_article_s_20.jpg' },
            ],
          },
        ] },
      }),
    };
  };

  const result = await loadWikiTreasureImageIndex({ fetchImpl, now: 10 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.searchParams.get('gcmtitle'), 'Category:Items');
    assert.equal(call.url.searchParams.get('prop'), 'pageimages|images');
    assert.equal(call.url.searchParams.has('titles'), false);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }
  assert.equal(
    result.get('harp stone'),
    'https://gbf.wiki/Special:Redirect/file/Item_article_s_20.jpg',
  );
  assert.equal(result.get('treasure 20'), result.get('harp stone'));
  assert.equal(
    result.get('satin feather'),
    'https://gbf.wiki/Special:Redirect/file/Satin_Feather.jpg',
  );
  assert.equal(result.get('gold brick'), 'https://gbf.wiki/images/Item_article_s_10.jpg');
  assert.equal(result.get('treasure 10'), 'https://gbf.wiki/images/Item_article_s_10.jpg');
  assert.equal(result.has('unsafe item'), false);
});

test('fresh v3 treasure metadata cache avoids a second public Wiki query', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        query: { pages: [
          {
            title: 'Satin Feather',
            images: [{ title: 'File:Satin_Feather.jpg' }],
          },
        ] },
      }),
    };
  };

  const first = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 10 });
  const second = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 20 });
  assert.equal(calls, 1);
  assert.equal(second.get('satin feather'), first.get('satin feather'));
});
