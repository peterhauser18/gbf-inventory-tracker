import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { parseVerifiedMultiraidObservation, type CombatParseContext } from './multiraid.ts';

const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';

function record(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:req', scanId: 'scan',
    meta: { requestId: 'req', url: ATTACK, resourceType: 'xhr', capturedAt: 10 },
    body, categories: [],
  };
}

function context(): CombatParseContext {
  return {
    raidTechnicalId: '777001', instanceId: 'instance-a',
    actorSlots: [
      { id: 'a', hp: 100, maxHp: 100, alive: true },
      { id: 'b', hp: 100, maxHp: 100, alive: true },
    ],
  };
}

test('boss super prefers explicit player target over numeric to-field when updating HP', () => {
  const observation = parseVerifiedMultiraidObservation(record({ scenario: [{
    cmd: 'super', target: 'player', to: 2,
    list: [{ damage: [{ pos: 0, value: 30, hp: 70 }, { pos: 1, value: 40, hp: 60 }] }],
  }] }), context());
  assert.ok(observation?.context);
  assert.equal(observation.context.actorSlots[0]?.hp, 70);
  assert.equal(observation.context.actorSlots[1]?.hp, 60);
});
