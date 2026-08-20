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

test('verified start prefers exact local battle ds portrait ids without changing actor identity', () => {
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
    {
      pid: 'mc',
      pid_image: 'fallback_mc',
      ability: [{ src: '/assets_en/123/img/sp/assets/leader/ds/450301.jpg' }],
    },
    {
      pid: 'ally',
      pid_image: 'fallback_ally',
      ability: [{ src: 'https://prd-game-a-granbluefantasy.akamaized.net/assets_en/123/img/sp/assets/npc/ds/3040001000.jpg' }],
    },
  ] } }), context);

  assert.equal(context.actorSlots[0]?.id, 'mc');
  assert.equal(actorVisualImageId(context.actorSlots[0]), '450301');
  assert.equal(actorVisualImageId(context.actors?.[1]), '3040001000');
});

test('verified start falls back to safe pid_image when no battle ds src is present', () => {
  const context: CombatParseContext = {
    raidTechnicalId: 'raid',
    actorSlots: [{ id: 'ally', name: 'Ally' }],
  };
  enrichObservedActorVisuals(startRecord({ player: { param: [
    { pid: 'ally', pid_image: '3040001000' },
  ] } }), context);
  assert.equal(actorVisualImageId(context.actorSlots[0]), '3040001000');
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
