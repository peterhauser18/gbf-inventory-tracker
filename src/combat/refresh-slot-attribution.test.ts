import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import { enrichVerifiedScenarioSemantics } from './verified-combat-semantics.ts';

const START = 'https://game.granbluefantasy.jp/rest/multiraid/start.json';
const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';

function record(url: string, body: unknown, capturedAt: number): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function parse(value: CapturedResponseRecord, context?: CombatParseContext): VerifiedCombatObservation {
  const observation = parseVerifiedMultiraidObservation(value, context);
  assert.ok(observation);
  enrichVerifiedScenarioSemantics(value.body, observation);
  return observation;
}

function startBody(turn: number, deadFront = false) {
  return {
    raid_id: 'instance-refresh-slots',
    quest_id: 777001,
    turn,
    player: {
      param: [
        { pid: 'mc-tech', name: 'Skyfarer', hp: deadFront ? 0 : 100, hpmax: 100, alive: deadFront ? 0 : 1 },
        { pid: 'front-a', name: 'Front A', hp: deadFront ? 0 : 100, hpmax: 100, alive: deadFront ? 0 : 1 },
        { pid: 'front-b', name: 'Front B', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'front-c', name: 'Front C', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'back-a', name: 'Back A', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'back-b', name: 'Back B', hp: 100, hpmax: 100, alive: 1 },
      ],
    },
  };
}

test('same-raid refresh preserves promoted backline action slots and original MC identity', () => {
  const start = parse(record(START, startBody(1), 10));
  assert.ok(start.context);

  const deaths = parse(record(ATTACK, { scenario: [
    { cmd: 'die', to: 'player', pos: 0 },
    { cmd: 'die', to: 'player', pos: 1 },
  ] }, 11), start.context);
  assert.ok(deaths.context);
  assert.equal(deaths.context.actorSlots[0]?.id, 'back-a');
  assert.equal(deaths.context.actorSlots[1]?.id, 'back-b');

  const refreshed = parse(record(START, startBody(6, true), 12), deaths.context);
  assert.ok(refreshed.context);
  assert.equal(refreshed.context.actorSlots[0]?.id, 'back-a');
  assert.equal(refreshed.context.actorSlots[1]?.id, 'back-b');
  assert.equal(refreshed.context.mainCharacterId, 'mc-tech');
  assert.equal(refreshed.context.accountDisplayName, 'Skyfarer');

  const attack = parse(record(ATTACK, { scenario: [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 30 }]] },
    { cmd: 'attack', from: 'player', pos: 1, damage: [[{ value: 40 }]] },
  ] }, 13), refreshed.context);
  assert.deepEqual(attack.actions.map((action) => ({
    actorId: action.actorId,
    actorName: action.actorName,
    damage: action.hits.reduce((sum, hit) => sum + hit.amount, 0),
  })), [
    { actorId: 'back-a', actorName: 'Back A', damage: 30 },
    { actorId: 'back-b', actorName: 'Back B', damage: 40 },
  ]);
});

test('initial joined start scenario promotes an explicitly dead frontline before later damage attribution', () => {
  const joinedBody = {
    raid_id: 'instance-join-trigger',
    quest_id: 777002,
    turn: 4,
    player: {
      param: [
        { pid: 'mc-tech', name: 'Skyfarer', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'front-a', name: 'Front A', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'lamretta', name: 'Lamretta', hp: 0, hpmax: 100, alive: 0 },
        { pid: 'front-c', name: 'Front C', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'lich', name: 'Lich', hp: 100, hpmax: 100, alive: 1 },
        { pid: 'orologia', name: 'Orologia', hp: 100, hpmax: 100, alive: 1 },
      ],
    },
    scenario: [{ cmd: 'die', to: 'player', pos: 2 }],
  };

  const joined = parse(record(START, joinedBody, 20));
  assert.ok(joined.context);
  assert.equal(joined.context.actorSlots[2]?.id, 'lich');
  assert.equal(joined.context.actorSlots[4]?.id, 'orologia');
  assert.equal(joined.context.actors?.find((actor) => actor.id === 'lamretta')?.alive, false);

  const refreshed = parse(record(START, joinedBody, 21), joined.context);
  assert.ok(refreshed.context);
  assert.equal(refreshed.context.actorSlots[2]?.id, 'lich');
  assert.equal(refreshed.context.actorSlots[4]?.id, 'orologia');

  const attack = parse(record(ATTACK, { scenario: [
    { cmd: 'attack', from: 'player', pos: 2, damage: [[{ value: 12345 }]] },
  ] }, 22), refreshed.context);
  assert.equal(attack.actions[0]?.actorId, 'lich');
  assert.equal(attack.actions[0]?.actorName, 'Lich');
});
