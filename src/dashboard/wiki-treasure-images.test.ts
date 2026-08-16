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
  assert.equal(url.searchParams.get('prop'), 'pageimages');
  assert.equal(url.searchParams.has('titles'), false);
  assert.equal(url.searchParams.has('where'), false);
  assert.equal(url.searchParams.has('ids'), false);
});

test('treasure image index follows public continuation, filters unsafe hosts and stays credential-free', async () => {
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
          { title: 'Gold Brick', thumbnail: { source: 'https://gbf.wiki/images/gold-brick.png' } },
          { title: 'Unsafe Item', thumbnail: { source: 'https://game.granbluefantasy.jp/assets/item.png' } },
        ] },
      }) : ({
        continue: { gcmcontinue: 'page|next', continue: '-||' },
        query: { pages: [
          { title: 'Harp Stone', thumbnail: { source: 'https://gbf.wiki/images/harp-stone.png' } },
        ] },
      }),
    };
  };

  const result = await loadWikiTreasureImageIndex({ fetchImpl, now: 10 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.searchParams.get('gcmtitle'), 'Category:Items');
    assert.equal(call.url.searchParams.has('titles'), false);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }
  assert.equal(result.get('harp stone'), 'https://gbf.wiki/images/harp-stone.png');
  assert.equal(result.get('gold brick'), 'https://gbf.wiki/images/gold-brick.png');
  assert.equal(result.has('unsafe item'), false);
});

test('fresh treasure metadata cache avoids a second public Wiki query', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        query: { pages: [
          { title: 'Harp Stone', thumbnail: { source: 'https://gbf.wiki/images/harp-stone.png' } },
        ] },
      }),
    };
  };

  const first = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 10 });
  const second = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 20 });
  assert.equal(calls, 1);
  assert.equal(second.get('harp stone'), first.get('harp stone'));
});
