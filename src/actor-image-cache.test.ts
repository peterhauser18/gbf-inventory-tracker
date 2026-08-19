import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorImageCacheKey,
  parseObservedActorImageResponse,
  readObservedActorImageBlob,
} from './actor-image-cache.ts';

test('accepts compact GBF actor assets and stores larger leader art only as fallback', () => {
  assert.deepEqual(
    parseObservedActorImageResponse(
      'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/s/311303_sw_1_01.jpg',
      'Image',
      'image/jpeg',
      200,
    ),
    {
      assetId: '311303_sw_1_01',
      url: 'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/s/311303_sw_1_01.jpg',
      mimeType: 'image/jpeg',
    },
  );
  assert.equal(
    parseObservedActorImageResponse(
      'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/123456/img/sp/assets/npc/s/3710216000_01.jpg',
      'Image',
      'image/jpeg',
      200,
    )?.assetId,
    '3710216000_01',
  );
  assert.equal(
    parseObservedActorImageResponse(
      'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
      'Image',
      'image/jpeg',
      200,
    )?.assetId,
    'leader_ds_311303_sw_1_01',
  );
});

test('rejects larger NPC variants plus non-image, failed, foreign and unrelated responses', () => {
  for (const variant of ['m', 'ds']) {
    assert.equal(parseObservedActorImageResponse(
      `https://game.granbluefantasy.jp/assets/img/sp/assets/npc/${variant}/3040427000_01.jpg`,
      'Image',
      'image/jpeg',
      200,
    ), null);
  }
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/s/311303_sw_1_01.jpg',
    'XHR',
    'image/jpeg',
    200,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/s/311303_sw_1_01.jpg',
    'Image',
    'image/jpeg',
    404,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://example.com/assets/img/sp/assets/npc/s/3040427000.jpg',
    'Image',
    'image/jpeg',
    200,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/weapon/m/1040318400.jpg',
    'Image',
    'image/jpeg',
    200,
  ), null);
});

test('reads compact actor art before locally observed leader fallback art', async () => {
  const requested: string[] = [];
  const compactKey = actorImageCacheKey('311303_sw_1_01');
  const fallbackKey = actorImageCacheKey('leader_ds_311303_sw_1_01');
  const cache = {
    async match(key: RequestInfo | URL): Promise<Response | undefined> {
      const normalized = String(key);
      requested.push(normalized);
      if (normalized === compactKey) return new Response('compact', { headers: { 'Content-Type': 'image/jpeg' } });
      if (normalized === fallbackKey) return new Response('fallback', { headers: { 'Content-Type': 'image/jpeg' } });
      return undefined;
    },
    async put(): Promise<void> {},
    async keys(): Promise<Request[]> { return []; },
    async delete(): Promise<boolean> { return false; },
  };
  const cacheStorage = {
    async open() { return cache; },
    async delete() { return false; },
  };

  const blob = await readObservedActorImageBlob('311303_sw_1_01', cacheStorage);
  assert.equal(await blob?.text(), 'compact');
  assert.deepEqual(requested, [compactKey]);
});
