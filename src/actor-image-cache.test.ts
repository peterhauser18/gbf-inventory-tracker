import test from 'node:test';
import assert from 'node:assert/strict';
import { parseObservedActorImageResponse } from './actor-image-cache.ts';

test('accepts already-loaded GBF MC and character portrait image responses', () => {
  assert.deepEqual(
    parseObservedActorImageResponse(
      'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
      'Image',
      'image/jpeg',
      200,
    ),
    {
      assetId: '311303_sw_1_01',
      url: 'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
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
});

test('rejects non-image, failed, foreign and unrelated responses', () => {
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
    'XHR',
    'image/jpeg',
    200,
  ), null);
  assert.equal(parseObservedActorImageResponse(
    'https://game.granbluefantasy.jp/assets/img/sp/assets/leader/ds/311303_sw_1_01.jpg',
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
