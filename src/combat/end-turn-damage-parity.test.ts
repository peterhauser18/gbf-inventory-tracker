import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
} from './complete-observation.ts';

const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';

function record(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:end-turn-parity',
    scanId: 'scan',
    meta: {
      requestId: 'end-turn-parity',
      url: ATTACK,
      resourceType: 'xhr',
      capturedAt: 100,
    },
    body,
    categories: [],
  };
}

function context(): CombatParseContext {
  return {
    raidTechnicalId: '777001',
    instanceId: 'instance-a',
    turn: 20,
    actorSlots: [
      { id: 'mc-tech', name: 'MC' },
      { id: 'ally-tech', name: 'Synthetic Ally' },
    ],
    mainCharacterId: 'mc-tech',
  };
}

test('raw-shaped turn_end boss damage remains in party total without inheriting the preceding skill actor', () => {
  const observation = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'ability', pos: 1, name: 'Synthetic Skill', to: 'player' },
    { cmd: 'loop_damage', to: 'boss', list: [[{ value: 10 }]] },
    { cmd: 'wait', fps: 12 },
    { cmd: 'damage', to: 'player', list: [{ pos: 0, value: 1, hp: 99 }], turn_end: true },
    { cmd: 'damage', to: 'boss', list: [{ value: 144_444 }], turn_end: true },
  ] }), context());

  assert.ok(observation);
  assert.equal(observation.actions.length, 2);

  const skill = observation.actions[0];
  assert.equal(skill?.actorId, 'ally-tech');
  assert.equal(skill?.kind, 'skill');
  assert.equal(skill?.hits.reduce((sum, hit) => sum + hit.amount, 0), 10);

  const endOfTurn = observation.actions[1];
  assert.equal(endOfTurn?.actorId, undefined);
  assert.equal(endOfTurn?.actorName, undefined);
  assert.equal(endOfTurn?.kind, 'other');
  assert.equal(endOfTurn?.name, 'Unclassified damage');
  assert.equal(endOfTurn?.hits.reduce((sum, hit) => sum + hit.amount, 0), 144_444);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  const ally = raid.characterDamage.find((row) => row.actorId === 'ally-tech');
  assert.equal(raid.partyDamage, 144_454);
  assert.equal(ally?.total, 10);
  assert.equal(ally?.breakdown.skill, 10);
  assert.equal(ally?.breakdown.other, undefined);
  assert.equal(raid.characterDamage.reduce((sum, row) => sum + row.total, 0), 10);
  assert.equal(raid.coverage.parseGapObserved, true);
  assert.equal(raid.damageQuality, 'partial');
});
