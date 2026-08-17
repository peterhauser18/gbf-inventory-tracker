import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  OBSERVED_ENEMY_ICON_CACHE_NAME,
  clearObservedEnemyIconCache,
  enemyIconAliasCacheKey,
  enemyIconCacheKey,
  parseObservedEnemyIconResponse,
  raidBossIconAliasCacheKey,
  raidNameWithoutLevelPrefix,
  readObservedEnemyIconBlob,
  readObservedRaidBossIconDataUrl,
  rememberObservedEnemyIconAlias,
  rememberObservedRaidBossIcon,
  storeObservedEnemyIconBody,
} from './enemy-icon-cache.ts';

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
      assert.equal(name, OBSERVED_ENEMY_ICON_CACHE_NAME);
      return cache;
    },
    delete: async (name: string) => {
      assert.equal(name, OBSERVED_ENEMY_ICON_CACHE_NAME);
      const hadValues = values.size > 0;
      values.clear();
      return hadValues;
    },
    values,
  };
}

test('only already-loaded enemy images on the proven static GBF asset host are accepted', () => {
  const accepted = parseObservedEnemyIconResponse(
    'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png',
    'Image',
    'image/png',
    200,
  );
  assert.deepEqual(accepted, {
    enemyId: '9102863',
    url: 'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png',
    mimeType: 'image/png',
  });
  assert.equal(parseObservedEnemyIconResponse(
    'https://prd-game-a-granbluefantasy.akamaized.net/assets/img/sp/assets/enemy/m/8103533_01.jpg',
    'Image',
    'image/jpeg',
    200,
  )?.enemyId, '8103533');

  const rejected = [
    ['https://evil.example/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png', 'Image', 'image/png', 200],
    ['https://prd-game-b-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png', 'Image', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/not-a-version/img/sp/assets/enemy/s/9102863.png', 'Image', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/l/9102863.png', 'Image', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/not-an-id.png', 'Image', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png', 'XHR', 'image/png', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png', 'Image', 'image/svg+xml', 200],
    ['https://prd-game-a-granbluefantasy.akamaized.net/assets_en/1786933262/img/sp/assets/enemy/s/9102863.png', 'Image', 'image/png', 404],
  ] as const;
  for (const [url, type, mimeType, status] of rejected) {
    assert.equal(parseObservedEnemyIconResponse(url, type, mimeType, status), null);
  }
});

test('observed enemy bytes round-trip locally without issuing a network request', async () => {
  const storage = memoryCacheStorage();
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]);
  const body = { body: Buffer.from(bytes).toString('base64'), base64Encoded: true };
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => { throw new Error('Enemy cache reads must not perform network access'); },
  });
  try {
    assert.equal(await storeObservedEnemyIconBody('8103533', 'image/png', body, storage), true);
    assert.equal(storage.values.has(enemyIconCacheKey('8103533')), true);
    const blob = await readObservedEnemyIconBlob('8103533', storage);
    assert.ok(blob);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [...bytes]);
    assert.equal(await readObservedEnemyIconBlob('999', storage), undefined);
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  }
});

test('raid icon names ignore the display level prefix', () => {
  assert.equal(raidNameWithoutLevelPrefix('Lvl 200 Narophirmidas'), 'Narophirmidas');
  assert.equal(raidNameWithoutLevelPrefix('Lv. 250 Hexachromatic Hierarch'), 'Hexachromatic Hierarch');
  assert.equal(raidNameWithoutLevelPrefix('Level 120 Osiris'), 'Osiris');
  assert.equal(raidNameWithoutLevelPrefix('Osiris'), 'Osiris');
  assert.equal(raidBossIconAliasCacheKey('Lvl 200 Narophirmidas'), raidBossIconAliasCacheKey('Narophirmidas'));
});

test('verified start aliases enemy_id and raid name to the observed cjs image asset id', async () => {
  const storage = memoryCacheStorage();
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0a]);
  const body = { body: Buffer.from(bytes).toString('base64'), base64Encoded: true };

  assert.equal(await storeObservedEnemyIconBody('4200263', 'image/png', body, storage), true);
  assert.equal(await rememberObservedEnemyIconAlias('9900010', '4200263', storage), true);
  assert.equal(await rememberObservedRaidBossIcon('Narophirmidas', '4200263', storage), true);
  assert.equal(storage.values.has(enemyIconAliasCacheKey('9900010')), true);
  assert.equal(storage.values.has(raidBossIconAliasCacheKey('Narophirmidas')), true);

  const aliased = await readObservedEnemyIconBlob('9900010', storage);
  assert.ok(aliased);
  assert.deepEqual([...new Uint8Array(await aliased.arrayBuffer())], [...bytes]);

  const dataUrl = await readObservedRaidBossIconDataUrl('Lvl 200 Narophirmidas', storage);
  assert.ok(dataUrl?.startsWith('data:image/png;base64,'));
});

test('background copies enemy images only from debugger responses already received by the game', () => {
  const source = readFileSync(new URL('./background.ts', import.meta.url), 'utf8');
  assert.match(source, /parseObservedEnemyIconResponse/);
  assert.match(source, /pendingEnemyIcons/);
  assert.match(source, /captureObservedEnemyIcon/);
  assert.match(source, /Network\.getResponseBody/);
  assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https:\/\/prd-game-a-granbluefantasy\.akamaized\.net/i);
});

test('invalid bodies are rejected and local cleanup removes the cache', async () => {
  const storage = memoryCacheStorage();
  assert.equal(await storeObservedEnemyIconBody('8103533', 'image/png', { body: 'raw', base64Encoded: false }, storage), false);
  assert.equal(await storeObservedEnemyIconBody('8103533', 'image/svg+xml', {
    body: Buffer.from([1, 2, 3]).toString('base64'),
    base64Encoded: true,
  }, storage), false);
  assert.equal(storage.values.size, 0);

  assert.equal(await storeObservedEnemyIconBody('8103533', 'image/png', {
    body: Buffer.from([1, 2, 3]).toString('base64'),
    base64Encoded: true,
  }, storage), true);
  assert.equal(await clearObservedEnemyIconCache(storage), true);
  assert.equal(await readObservedEnemyIconBlob('8103533', storage), undefined);
});
