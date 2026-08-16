import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OBSERVED_TREASURE_ICON_CACHE_NAME,
  clearObservedTreasureIconCache,
  parseObservedTreasureIconResponse,
  readObservedTreasureIconBlob,
  storeObservedTreasureIconBody,
  treasureIconCacheKey,
} from './treasure-icon-cache.ts';

function memoryCacheStorage() {
  const values = new Map<string, Response>();
  const cache = {
    match: async (key: RequestInfo | URL) => values.get(String(key))?.clone(),
    put: async (key: RequestInfo | URL, response: Response) => {
      values.set(String(key), response.clone());
    },
  };
  return {
    open: async (name: string) => {
      assert.equal(name, OBSERVED_TREASURE_ICON_CACHE_NAME);
      return cache;
    },
    delete: async (name: string) => {
      assert.equal(name, OBSERVED_TREASURE_ICON_CACHE_NAME);
      const hadValues = values.size > 0;
      values.clear();
      return hadValues;
    },
    values,
  };
}

test('only the proven already-loaded GBF small Treasure JPEG path is allowlisted', () => {
  const accepted = parseObservedTreasureIconResponse(
    'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/210.jpg',
    'Image',
    'image/jpeg',
    200,
  );
  assert.deepEqual(accepted, {
    itemId: '210',
    url: 'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/210.jpg',
    mimeType: 'image/jpeg',
  });

  const rejected = [
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/m/210.jpg', 'Image', 'image/jpeg', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sprite/v3/collect_item/parts.png', 'Image', 'image/png', 200],
    ['https://game.granbluefantasy.jp/assets_en/img/sp/assets/item/article/s/210.jpg', 'Image', 'image/jpeg', 200],
    ['https://evil.example/assets_en/img/sp/assets/item/article/s/210.jpg', 'Image', 'image/jpeg', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/not-an-id.jpg', 'Image', 'image/jpeg', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/210.jpg', 'XHR', 'image/jpeg', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/210.jpg', 'Image', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/assets/item/article/s/210.jpg', 'Image', 'image/jpeg', 404],
  ] as const;

  for (const [url, type, mimeType, status] of rejected) {
    assert.equal(parseObservedTreasureIconResponse(url, type, mimeType, status), null);
  }
});

test('already-read debugger image bytes round-trip through Cache Storage without network access', async () => {
  const storage = memoryCacheStorage();
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0xff, 0xd9]);
  const body = {
    body: Buffer.from(bytes).toString('base64'),
    base64Encoded: true,
  };

  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => { throw new Error('Treasure cache reads must not perform network access'); },
  });
  try {
    assert.equal(await storeObservedTreasureIconBody('210', body, storage), true);
    assert.equal(storage.values.has(treasureIconCacheKey('210')), true);
    const blob = await readObservedTreasureIconBlob('210', storage);
    assert.ok(blob);
    assert.equal(blob.type, 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [...bytes]);
    assert.equal(await readObservedTreasureIconBlob('999', storage), undefined);
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});

test('invalid debugger bodies are not persisted and cache cleanup is reversible', async () => {
  const storage = memoryCacheStorage();
  assert.equal(await storeObservedTreasureIconBody('210', { body: 'raw-jpeg', base64Encoded: false }, storage), false);
  assert.equal(storage.values.size, 0);

  assert.equal(await storeObservedTreasureIconBody('210', {
    body: Buffer.from([1, 2, 3]).toString('base64'),
    base64Encoded: true,
  }, storage), true);
  assert.equal(await clearObservedTreasureIconCache(storage), true);
  assert.equal(await readObservedTreasureIconBlob('210', storage), undefined);
});
