import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorImageCacheKey,
  actorVariantAssetId,
  parseObservedActorImageResponse,
  readObservedActorImageBlob,
} from './actor-image-cache.ts';

test('keeps observed GBF actor variants separate so battle ds art cannot be overwritten', () => {
  assert.deepEqual(
    parseObservedActorImageResponse(
      'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
      'Image',
      'image/jpeg',
      200,
    ),
    {
      assetId: 'leader_ds_311303_sw_1_01',
      url: 'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
      mimeType: 'image/jpeg',
    },
  );
  assert.equal(
    parseObservedActorImageResponse(
      'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/123456/img/sp/assets/npc/ds/3040427000.jpg',
      'Image',
      'image/jpeg',
      200,
    )?.assetId,
    'npc_ds_3040427000',
  );
  assert.equal(
    parseObservedActorImageResponse(
      'https://game.granbluefantasy.jp/assets/img/sp/assets/npc/s/3710216000_01.jpg',
      'Image',
      'image/jpeg',
      200,
    )?.assetId,
    'npc_s_3710216000_01',
  );
});

test('rejects non-image, failed, foreign and unrelated responses', () => {
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/npc/ds/3040427000.jpg',
    'XHR',
    'image/jpeg',
    200,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/npc/ds/3040427000.jpg',
    'Image',
    'image/jpeg',
    404,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://example.com/assets/img/sp/assets/npc/ds/3040427000.jpg',
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

test('reads locally observed battle ds art before s or m variants', async () => {
  const requested: string[] = [];
  const dsKey = actorImageCacheKey(actorVariantAssetId('npc', 'ds', '3040427000'));
  const sKey = actorImageCacheKey(actorVariantAssetId('npc', 's', '3040427000'));
  const cache = {
    async match(key: RequestInfo | URL): Promise<Response | undefined> {
      const normalized = String(key);
      requested.push(normalized);
      if (normalized === dsKey) return new Response('battle-ds', { headers: { 'Content-Type': 'image/jpeg' } });
      if (normalized === sKey) return new Response('small-s', { headers: { 'Content-Type': 'image/jpeg' } });
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

  const blob = await readObservedActorImageBlob('3040427000', cacheStorage);
  assert.equal(await blob?.text(), 'battle-ds');
  assert.deepEqual(requested, [dsKey]);
});
