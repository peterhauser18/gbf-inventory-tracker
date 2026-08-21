import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorImageCacheKey,
  actorVariantAssetId,
  parseObservedActorImageResponse,
  readObservedActorImageBlob,
} from './actor-image-cache.ts';

test('keeps observed GBF actor variants separate so one size cannot overwrite another', () => {
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

test('reads locally observed card-sized m art before s or battle ds variants', async () => {
  const requested: string[] = [];
  const mKey = actorImageCacheKey(actorVariantAssetId('npc', 'm', '3040427000'));
  const sKey = actorImageCacheKey(actorVariantAssetId('npc', 's', '3040427000'));
  const dsKey = actorImageCacheKey(actorVariantAssetId('npc', 'ds', '3040427000'));
  const cache = {
    async match(key: RequestInfo | URL): Promise<Response | undefined> {
      const normalized = String(key);
      requested.push(normalized);
      if (normalized === mKey) return new Response('medium-card', { headers: { 'Content-Type': 'image/jpeg' } });
      if (normalized === sKey) return new Response('small-card', { headers: { 'Content-Type': 'image/jpeg' } });
      if (normalized === dsKey) return new Response('battle-ds', { headers: { 'Content-Type': 'image/jpeg' } });
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
  assert.equal(await blob?.text(), 'medium-card');
  assert.deepEqual(requested, [mKey]);
});

test('falls back to locally observed battle ds art when card-sized variants are missing', async () => {
  const requested: string[] = [];
  const npcM = actorImageCacheKey(actorVariantAssetId('npc', 'm', '3040427000'));
  const leaderM = actorImageCacheKey(actorVariantAssetId('leader', 'm', '3040427000'));
  const npcS = actorImageCacheKey(actorVariantAssetId('npc', 's', '3040427000'));
  const leaderS = actorImageCacheKey(actorVariantAssetId('leader', 's', '3040427000'));
  const npcDs = actorImageCacheKey(actorVariantAssetId('npc', 'ds', '3040427000'));
  const cache = {
    async match(key: RequestInfo | URL): Promise<Response | undefined> {
      const normalized = String(key);
      requested.push(normalized);
      if (normalized === npcDs) return new Response('battle-ds', { headers: { 'Content-Type': 'image/jpeg' } });
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
  assert.deepEqual(requested, [npcM, leaderM, npcS, leaderS, npcDs]);
});
