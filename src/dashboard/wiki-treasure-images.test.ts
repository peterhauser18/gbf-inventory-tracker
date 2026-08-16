import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWikiTreasureCategoryImageUrl,
  buildWikiTreasureImageIndexUrl,
  loadWikiTreasureImageIndex,
  parseWikiTreasureItemsHtml,
} from './wiki-treasure-images.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const itemsHtml = `
<table>
  <tr><td><a href="/File:Satin_Feather.jpg"><img alt="Satin Feather" src="/images/a/aa/Satin_Feather.jpg"></a></td><td><a href="/Satin_Feather">Satin Feather</a></td><td>Port Breeze treasure.</td></tr>
  <tr><td><a href="/File:Item_article_s_15.jpg"><img alt="Blistering Ore" src="/images/1/15/Item_article_s_15.jpg"></a></td><td><a href="/Blistering_Ore">Blistering Ore</a></td><td>Valtz treasure.</td></tr>
  <tr><td><img alt="Fire Crystal" src="/images/thumb/c/cr/Fire_Crystal.jpg/100px-Fire_Crystal.jpg"></td><td><a href="/Elemental_Crystal">Fire Crystal</a></td></tr>
  <tr><td><img alt="Fire Orb" src="/images/thumb/o/orb/Fire_Orb.jpg/100px-Fire_Orb.jpg"></td><td><a href="/Low_Orb">Fire Orb</a></td></tr>
  <tr><td><img alt="Unsafe" src="https://game.granbluefantasy.jp/assets/item.png"></td><td><a href="/Unsafe_Item">Unsafe Item</a></td></tr>
</table>`;

test('treasure metadata uses fixed public Items and Category:Items queries without owned identifiers', () => {
  const itemsUrl = new URL(buildWikiTreasureImageIndexUrl());
  assert.equal(itemsUrl.origin, 'https://gbf.wiki');
  assert.equal(itemsUrl.pathname, '/api.php');
  assert.equal(itemsUrl.searchParams.get('action'), 'parse');
  assert.equal(itemsUrl.searchParams.get('page'), 'Items');
  assert.equal(itemsUrl.searchParams.get('prop'), 'text');
  assert.equal(itemsUrl.searchParams.get('disableeditsection'), '1');
  assert.equal(itemsUrl.searchParams.has('titles'), false);
  assert.equal(itemsUrl.searchParams.has('ids'), false);

  const categoryUrl = new URL(buildWikiTreasureCategoryImageUrl());
  assert.equal(categoryUrl.origin, 'https://gbf.wiki');
  assert.equal(categoryUrl.searchParams.get('action'), 'query');
  assert.equal(categoryUrl.searchParams.get('generator'), 'categorymembers');
  assert.equal(categoryUrl.searchParams.get('gcmtitle'), 'Category:Items');
  assert.equal(categoryUrl.searchParams.get('prop'), 'pageimages');
  assert.equal(categoryUrl.searchParams.get('piprop'), 'thumbnail|name');
  assert.equal(categoryUrl.searchParams.has('titles'), false);
  assert.equal(categoryUrl.searchParams.has('ids'), false);
});

test('rendered Items rows use visible item labels even when several labels target grouped pages', () => {
  const result = parseWikiTreasureItemsHtml(itemsHtml);
  assert.equal(result.get('satin feather'), 'https://gbf.wiki/images/a/aa/Satin_Feather.jpg');
  assert.equal(result.get('blistering ore'), 'https://gbf.wiki/images/1/15/Item_article_s_15.jpg');
  assert.equal(result.get('fire crystal'), 'https://gbf.wiki/images/thumb/c/cr/Fire_Crystal.jpg/100px-Fire_Crystal.jpg');
  assert.equal(result.get('fire orb'), 'https://gbf.wiki/images/thumb/o/orb/Fire_Orb.jpg/100px-Fire_Orb.jpg');
  assert.equal(result.has('elemental crystal'), false);
  assert.equal(result.has('low orb'), false);
  assert.equal(result.has('unsafe item'), false);
});

test('complete Category:Items pageimages supplement the old Items page and follow public continuation', async () => {
  const calls: Array<{ url: URL; init?: RequestInit; receiver: unknown }> = [];
  const fetchImpl = async function (this: unknown, input: string | URL, init?: RequestInit) {
    const url = new URL(input.toString());
    calls.push({ url, init, receiver: this });
    if (url.searchParams.get('action') === 'parse') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ parse: { text: itemsHtml } }),
      };
    }
    if (url.searchParams.get('gcmcontinue')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          query: { pages: [
            {
              title: 'Meditative Sutra',
              thumbnail: { source: 'https://gbf.wiki/images/thumb/a/aa/Meditative_Sutra.jpg/64px-Meditative_Sutra.jpg' },
            },
            {
              title: 'Unsafe Item',
              thumbnail: { source: 'https://game.granbluefantasy.jp/assets/item.png' },
            },
          ] },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        continue: { gcmcontinue: 'page|next', continue: '-||' },
        query: { pages: [
          { title: 'Gray Sandstone', pageimage: 'Item_article_s_125.jpg' },
          { title: 'Satin Feather', pageimage: 'Wrong_Satin.jpg' },
        ] },
      }),
    };
  };

  const result = await loadWikiTreasureImageIndex({ fetchImpl, now: 10 });
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.receiver, globalThis);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
    assert.equal(call.url.searchParams.has('titles'), false);
    assert.equal(call.url.searchParams.has('ids'), false);
  }
  assert.equal(result.get('satin feather'), 'https://gbf.wiki/images/a/aa/Satin_Feather.jpg');
  assert.equal(
    result.get('gray sandstone'),
    'https://gbf.wiki/Special:Redirect/file/Item_article_s_125.jpg',
  );
  assert.equal(
    result.get('meditative sutra'),
    'https://gbf.wiki/images/thumb/a/aa/Meditative_Sutra.jpg/64px-Meditative_Sutra.jpg',
  );
  assert.equal(result.has('unsafe item'), false);
});

test('fresh v6 treasure metadata cache avoids repeated public Wiki queries', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = async (input: string | URL) => {
    calls += 1;
    const url = new URL(input.toString());
    if (url.searchParams.get('action') === 'parse') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ parse: { text: itemsHtml } }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ query: { pages: [] } }),
    };
  };

  const first = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 10 });
  const second = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 20 });
  assert.equal(calls, 2);
  assert.equal(second.get('satin feather'), first.get('satin feather'));
  assert.equal(second.get('fire crystal'), first.get('fire crystal'));
});
