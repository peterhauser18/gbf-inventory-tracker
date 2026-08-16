import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { parseVerifiedMultiraidObservation } from './multiraid.ts';
import { enrichVerifiedScenarioSemantics } from './verified-combat-semantics.ts';

const START = 'https://game.granbluefantasy.jp/rest/multiraid/start.json';

function record(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:req-supporter',
    scanId: 'scan',
    meta: { requestId: 'req-supporter', url: START, resourceType: 'xhr', capturedAt: 1 },
    body,
    categories: [],
  };
}

test('supporter summon keeps directly observed name, id and cooldown as the sixth slot', () => {
  const captured = record({
    raid_id: 'instance-a',
    quest_id: 777001,
    turn: 1,
    player: { param: [{ pid: 'mc-tech', name: 'Skyfarer' }] },
    summon: [
      { id: '2040001000', name: 'Own A', recast: '0' },
      { id: '2040002000', name: 'Own B', recast: '1' },
      { id: '2040003000', name: 'Own C', recast: '2' },
      { id: '2040004000', name: 'Own D', recast: '3' },
      { id: '2040005000', name: 'Own E', recast: '4' },
    ],
    supporter: {
      id: '2040094000',
      name: 'Synthetic Support Summon',
      recast: '0',
      friend: true,
    },
  });

  const observation = parseVerifiedMultiraidObservation(captured);
  assert.ok(observation?.context);
  enrichVerifiedScenarioSemantics(captured.body, observation);

  assert.equal(observation.context.summons?.length, 6);
  assert.deepEqual(observation.context.summons?.[5], {
    id: '2040094000',
    name: 'Synthetic Support Summon',
    cooldown: 0,
    used: false,
  });
});
