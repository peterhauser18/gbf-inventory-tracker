import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('treasure image metadata uses one fixed account-independent rendered Items page query', () => {
  const url = new URL(buildWikiTreasureImageIndexUrl());
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.pathname, '/api.php');
  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('page'), 'Items');
  assert.equal(url.searchParams.get('prop'), 'text');
  assert.equal(url.searchParams.get('disableeditsection'), '1');
  assert.equal(url.searchParams.has('titles'), false);
  assert.equal(url.searchParams.has('ids'), false);
  assert.equal(url.searchParams.has('generator'), false);
});

test('rendered Items rows resolve normal treasures and grouped-page labels without filename heuristics', () => {
  const result = parseWikiTreasureItemsHtml(itemsHtml);
  assert.equal(result.get('satin feather'), 'https://gbf.wiki/images/a/aa/Satin_Feather.jpg');
  assert.equal(result.get('blistering ore'), 'https://gbf.wiki/images/1/15/Item_article_s_15.jpg');
  assert.equal(result.get('fire crystal'), 'https://gbf.wiki/images/thumb/c/cr/Fire_Crystal.jpg/100px-Fire_Crystal.jpg');
  assert.equal(result.get('fire orb'), 'https://gbf.wiki/images/thumb/o/orb/Fire_Orb.jpg/100px-Fire_Orb.jpg');
  assert.equal(result.has('unsafe item'), false);
});

test('fresh v5 treasure metadata cache avoids a second public Wiki query', async () => {
  const storage = memoryStorage();
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: new URL(input.toString()), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ parse: { text: itemsHtml } }),
    };
  };

  const first = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 10 });
  const second = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 20 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.searchParams.get('page'), 'Items');
  assert.equal(calls[0]?.init?.credentials, 'omit');
  assert.equal(calls[0]?.init?.referrerPolicy, 'no-referrer');
  assert.equal(second.get('satin feather'), first.get('satin feather'));
  assert.equal(second.get('fire crystal'), first.get('fire crystal'));
});
