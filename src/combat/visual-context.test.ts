import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import type { CombatParseContext } from './multiraid.ts';
import {
  actorVisualImageId,
  bossImageAssetIdFromCjs,
  enrichObservedActorVisuals,
  retainActorVisualId,
} from './visual-context.ts';

function startRecord(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:req-1',
    scanId: 'scan',
    meta: {
      requestId: 'req-1',
      url: 'https://game.granbluefantasy.jp/rest/multiraid/start.json',
      resourceType: 'xhr',
      capturedAt: 1,
    },
    body,
    categories: [],
  };
}

test('verified start keeps pid_image on matching actors without changing actor identity', () => {
  const context: CombatParseContext = {
    raidTechnicalId: 'raid',
    actorSlots: [
      { id: 'mc', name: 'MC' },
      { id: 'ally', name: 'Ally' },
    ],
    actors: [
      { id: 'mc', name: 'MC' },
      { id: 'ally', name: 'Ally' },
    ],
  };
  enrichObservedActorVisuals(startRecord({ player: { param: [
    { pid: 'mc', pid_image: '450301' },
    { pid: 'ally', pid_image: '3040001000' },
  ] } }), context);

  assert.equal(context.actorSlots[0]?.id, 'mc');
  assert.equal(actorVisualImageId(context.actorSlots[0]), '450301');
  assert.equal(actorVisualImageId(context.actors?.[1]), '3040001000');
});

test('boss cjs values expose the image asset id independently from enemy_id', () => {
  assert.equal(bossImageAssetIdFromCjs('enemy_4200263'), '4200263');
  assert.equal(bossImageAssetIdFromCjs('enemy_8103533_form_a'), '8103533');
  assert.equal(bossImageAssetIdFromCjs('9900010'), undefined);
  assert.equal(bossImageAssetIdFromCjs('../enemy_4200263'), undefined);
});

test('retaining a dead/history actor copy preserves only a safe visual asset id', () => {
  const source = { id: 'ally', alive: false };
  (source as typeof source & { imageId: string }).imageId = '3040001000';
  const retained = retainActorVisualId(source, { id: source.id, alive: source.alive });
  assert.equal(actorVisualImageId(retained), '3040001000');

  const unsafe = { id: 'bad' };
  (unsafe as typeof unsafe & { imageId: string }).imageId = '../secret';
  assert.equal(actorVisualImageId(retainActorVisualId(unsafe, { id: 'bad' })), undefined);
});
