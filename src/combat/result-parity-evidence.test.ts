import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { classifyVerifiedNormalDamage } from './damage-semantics.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import { enrichVerifiedScenarioSemantics } from './verified-combat-semantics.ts';

const START = 'https://game.granbluefantasy.jp/rest/multiraid/start.json';
const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';
const ABILITY = 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json';
const SUMMON = 'https://game.granbluefantasy.jp/rest/multiraid/summon_result.json';

function record(url: string, body: unknown, capturedAt: number): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function parse(
  value: CapturedResponseRecord,
  context?: CombatParseContext,
): VerifiedCombatObservation {
  const observation = parseVerifiedMultiraidObservation(value, context);
  assert.ok(observation);
  enrichVerifiedScenarioSemantics(value.body, observation);
  return observation;
}

function startBody(turn = 1, scenario: unknown[] = []) {
  return {
    raid_id: 'instance-parity',
    quest_id: 777001,
    turn,
    player: {
      param: [
        { pid: 'mc-tech', name: 'Local Display Name', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000001', name: 'Synthetic Ally', hp: 100, hpmax: 100, alive: 1 },
      ],
    },
    scenario,
  };
}

test('verified normal concurrent lanes stay normal unless a proven echo pattern is present', () => {
  const concurrent = classifyVerifiedNormalDamage([
    { amount: 100, kind: 'normal', attackCount: 0, concurrentAttackCount: 0 },
    { amount: 40, kind: 'normal', attackCount: 0, concurrentAttackCount: 1 },
    { amount: 30, kind: 'normal', attackCount: 0, concurrentAttackCount: 2 },
  ]);
  assert.deepEqual(concurrent.map((hit) => hit.kind), ['normal', 'normal', 'normal']);

  const echo = classifyVerifiedNormalDamage([
    { amount: 100, kind: 'normal', attackCount: 0, concurrentAttackCount: 0, isRandomAttack: true },
    { amount: 20, kind: 'normal', attackCount: 0, concurrentAttackCount: 1, isRandomAttack: true },
    { amount: 101, kind: 'normal', attackCount: 0, concurrentAttackCount: 0, isRandomAttack: true },
    { amount: 21, kind: 'normal', attackCount: 0, concurrentAttackCount: 1, isRandomAttack: true },
  ]);
  assert.deepEqual(echo.map((hit) => hit.kind), ['normal', 'echo', 'normal', 'echo']);
});

test('turn-one start scenario damage is retained and a later refresh snapshot does not replay it', () => {
  const start = parse(record(START, startBody(1, [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 25 }]] },
    { cmd: 'attack', from: 'player', pos: 1, damage: [[{ value: 8 }]] },
  ]), 10));

  assert.deepEqual(start.actions.map((action) => ({
    actorId: action.actorId,
    actorName: action.actorName,
    damage: action.hits.reduce((sum, hit) => sum + hit.amount, 0),
  })), [
    { actorId: 'mc-tech', actorName: undefined, damage: 25 },
    { actorId: '3020000001', actorName: 'Synthetic Ally', damage: 8 },
  ]);

  const first = mergeVerifiedMultiraidObservation(null, start);
  assert.equal(first.partyDamage, 33);

  assert.ok(start.context);
  const refreshed = parse(record(START, startBody(8, [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 25 }]] },
    { cmd: 'attack', from: 'player', pos: 1, damage: [[{ value: 8 }]] },
  ]), 20), start.context);
  assert.equal(refreshed.actions.length, 0);
  const afterRefresh = mergeVerifiedMultiraidObservation(first, refreshed);
  assert.equal(afterRefresh.partyDamage, 33);
});

test('direct boss auxiliary damage stays in party total without character attribution', () => {
  const start = parse(record(START, startBody(1, [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 5 }]] },
    { cmd: 'attack', from: 'player', pos: 1, damage: [[{ value: 2 }]] },
  ]), 10));
  assert.ok(start.context);

  let raid = mergeVerifiedMultiraidObservation(null, start);
  let context = start.context;

  const attack = parse(record(ATTACK, { scenario: [
    {
      cmd: 'attack',
      from: 'player',
      pos: 0,
      total_attack_num: 1,
      damage: [[
        { value: 10, attack_count: 0, concurrent_attack_count: 0 },
        { value: 4, attack_count: 0, concurrent_attack_count: 1 },
      ]],
    },
    {
      cmd: 'attack',
      from: 'player',
      pos: 1,
      total_attack_num: 1,
      damage: [[
        { value: 8, attack_count: 0, concurrent_attack_count: 0 },
        { value: 3, attack_count: 0, concurrent_attack_count: 1 },
      ]],
    },
  ] }, 11), context);
  assert.ok(attack.context);
  raid = mergeVerifiedMultiraidObservation(raid, attack);
  context = attack.context;

  const partyOnlyScenario = Array.from({ length: 6 }, () => [
    { cmd: 'ability', pos: 0, name: 'Synthetic Direct Boss Effect', to: 'boss' },
    { cmd: 'damage', to: 'boss', list: [{ value: 2_000_000 }] },
  ]).flat();
  const ability = parse(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 1, name: 'Synthetic Skill', to: 'player' },
    { cmd: 'damage', to: 'boss', list: [{ value: 6 }] },
    ...partyOnlyScenario,
  ] }, 12), context);
  assert.ok(ability.context);
  assert.equal(ability.actions[0]?.actorId, '3020000001');
  const partyOnly = ability.actions.slice(1);
  assert.equal(partyOnly.length, 6);
  assert.equal(partyOnly.every((action) => action.actorId === undefined && action.actorName === undefined), true);
  assert.equal(partyOnly.reduce((sum, action) => sum + action.hits.reduce((hitSum, hit) => hitSum + hit.amount, 0), 0), 12_000_000);
  raid = mergeVerifiedMultiraidObservation(raid, ability);
  context = ability.context;

  const summon = parse(record(SUMMON, { scenario: [
    { cmd: 'summon', name: 'Synthetic Summon', list: [{ damage: [{ value: 7 }] }] },
  ] }, 13), context);
  assert.equal(summon.actions[0]?.actorId, 'mc-tech');
  assert.equal(summon.actions[0]?.actorName, undefined);
  raid = mergeVerifiedMultiraidObservation(raid, summon);

  const byActor = new Map(raid.characterDamage.map((row) => [row.actorId, row]));
  const characterTotal = raid.characterDamage.reduce((sum, row) => sum + row.total, 0);
  assert.equal(raid.partyDamage, 12_000_045);
  assert.equal(characterTotal, 45);
  assert.equal((raid.partyDamage ?? 0) - characterTotal, 12_000_000);
  assert.deepEqual(byActor.get('mc-tech'), {
    actorId: 'mc-tech',
    total: 26,
    breakdown: { normal: 19, other: 7 },
    quality: 'partial',
  });
  assert.deepEqual(byActor.get('3020000001'), {
    actorId: '3020000001',
    actorName: 'Synthetic Ally',
    total: 19,
    breakdown: { normal: 13, skill: 6 },
    quality: 'partial',
  });
});