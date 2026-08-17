import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { classifyObservedResponseUrl } from '../capture/route.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './complete-observation.ts';

const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';
const ABILITY = 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json';
const FATED_CHAIN = 'https://game.granbluefantasy.jp/rest/multiraid/fatal_chain_result.json';

function record(url: string, body: unknown, capturedAt = 10): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function context(): CombatParseContext {
  return {
    raidTechnicalId: '777001',
    instanceId: 'instance-a',
    turn: 3,
    mainCharacterId: 'mc-tech',
    actorSlots: [
      { id: 'mc-tech', name: 'MC' },
      { id: 'front-a', name: 'Front A' },
      { id: 'front-b', name: 'Front B' },
      { id: 'front-c', name: 'Front C' },
      { id: 'back-a', name: 'Back A' },
      { id: 'back-b', name: 'Back B' },
    ],
    actors: [],
  };
}

function parse(value: CapturedResponseRecord, ctx = context()): VerifiedCombatObservation {
  const observation = parseVerifiedMultiraidObservation(value, ctx);
  assert.ok(observation);
  return observation;
}

test('passive response routing accepts Fated Chain but keeps unrelated families blocked', () => {
  assert.equal(classifyObservedResponseUrl(FATED_CHAIN), 'combat');
  assert.equal(
    classifyObservedResponseUrl('https://game.granbluefantasy.jp/rest/multiraid/unknown_result.json'),
    null,
  );
});

test('special_npc is retained as a C.A. on the current slot actor', () => {
  const observation = parse(record(ATTACK, { scenario: [{
    cmd: 'special_npc',
    target: 'boss',
    pos: 1,
    name: 'Synthetic NPC C.A.',
    list: [{ damage: [{ value: 10 }, { value: 20 }] }],
  }] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, 'front-a');
  assert.equal(observation.actions[0]?.kind, 'ougi');
  assert.equal(observation.actions[0]?.hits.reduce((sum, hit) => sum + hit.amount, 0), 30);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  assert.equal(raid.partyDamage, 30);
  assert.equal(raid.characterDamage.find((row) => row.actorId === 'front-a')?.breakdown.ougi, 30);
});

test('C.A.-adjacent damage and loop_damage keep the actor and land in Skill damage within the bounded source window', () => {
  const observation = parse(record(ATTACK, { scenario: [
    {
      cmd: 'special',
      target: 'boss',
      pos: 0,
      name: 'Synthetic C.A.',
      list: [{ damage: [{ value: 100 }] }],
    },
    { cmd: 'message' },
    { cmd: 'damage', to: 'boss', list: [{ value: 20 }] },
    { cmd: 'message' },
    { cmd: 'loop_damage', to: 'boss', list: [[{ value: 30 }, { value: 40 }]] },
  ] }));

  assert.equal(observation.actions.length, 3);
  assert.equal(observation.actions[1]?.actorId, 'mc-tech');
  assert.equal(observation.actions[2]?.actorId, 'mc-tech');
  assert.equal(observation.actions[1]?.name, 'C.A. follow-up');
  assert.equal(observation.actions[2]?.name, 'C.A. follow-up');
  assert.deepEqual(observation.actions[1]?.hits.map((hit) => hit.kind), ['skill']);
  assert.deepEqual(observation.actions[2]?.hits.map((hit) => hit.kind), ['skill', 'skill']);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  const mc = raid.characterDamage.find((row) => row.actorId === 'mc-tech');
  assert.equal(raid.partyDamage, 190);
  assert.equal(mc?.total, 190);
  assert.equal(mc?.breakdown.ougi, 100);
  assert.equal(mc?.breakdown.skill, 90);
});

test('ability-scoped loop damage remains one attributed skill action', () => {
  const observation = parse(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 1, name: 'Synthetic Skill' },
    { cmd: 'loop_damage', to: 'boss', list: [{ value: 25 }, { value: 25 }] },
  ] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, 'front-a');
  assert.equal(observation.actions[0]?.kind, 'skill');
  assert.equal(observation.actions[0]?.hits.reduce((sum, hit) => sum + hit.amount, 0), 50);
});

test('death promotion changes later slot attribution without stealing a pre-death follow-up', () => {
  const observation = parse(record(ATTACK, { scenario: [
    {
      cmd: 'special',
      target: 'boss',
      pos: 1,
      name: 'Old Front C.A.',
      list: [{ damage: [{ value: 100 }] }],
    },
    { cmd: 'die', to: 'player', pos: 1 },
    { cmd: 'loop_damage', to: 'boss', list: [{ value: 50 }] },
    {
      cmd: 'special_npc',
      target: 'boss',
      pos: 1,
      name: 'Promoted C.A.',
      list: [{ damage: [{ value: 200 }] }],
    },
  ] }));

  assert.equal(observation.actions[0]?.actorId, 'front-a');
  assert.equal(observation.actions[1]?.actorId, 'front-a');
  assert.equal(observation.actions[2]?.actorId, 'back-a');
  assert.equal(observation.context?.actorSlots[1]?.id, 'back-a');

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  const dead = raid.characterDamage.find((row) => row.actorId === 'front-a');
  const promoted = raid.characterDamage.find((row) => row.actorId === 'back-a');
  assert.equal(dead?.total, 150);
  assert.equal(dead?.breakdown.ougi, 100);
  assert.equal(dead?.breakdown.skill, 50);
  assert.equal(promoted?.breakdown.ougi, 200);
});

test('chain_cutin reclassifies already-attributed damage instead of double-counting Chain Burst', () => {
  const observation = parse(record(ATTACK, { scenario: [
    { cmd: 'ability', pos: 3, name: 'Misleading pending skill' },
    { cmd: 'chain_cutin' },
    { cmd: 'damage', to: 'boss', list: [{ value: 75 }] },
  ] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, 'mc-tech');
  assert.equal(observation.actions[0]?.kind, 'other');
  assert.equal(observation.actions[0]?.name, 'Chain Burst');
  assert.deepEqual(observation.actions[0]?.hits.map((hit) => hit.kind), ['other']);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  const mc = raid.characterDamage.find((row) => row.actorId === 'mc-tech');
  assert.equal(raid.partyDamage, 75);
  assert.equal(mc?.total, 75);
  assert.equal(mc?.breakdown.other, 75);
  assert.equal(raid.characterDamage.find((row) => row.actorId === 'front-c'), undefined);
});

test('Fated Chain damage that carries an observed MC actor is retained on MC but classified Other', () => {
  const observation = parse(record(FATED_CHAIN, { scenario: [
    { cmd: 'ability', pos: 0, name: 'Fated Rending' },
    { cmd: 'damage', to: 'boss', list: [{ value: 1_500_000 }] },
    { cmd: 'boss_gauge', hp: 900, hpmax: 1000 },
  ] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, 'mc-tech');
  assert.equal(observation.actions[0]?.kind, 'other');
  assert.equal(observation.actions[0]?.name, 'Fated Rending');
  assert.deepEqual(observation.actions[0]?.hits.map((hit) => hit.kind), ['other']);
  assert.equal(observation.boss?.hp, 900);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  const mc = raid.characterDamage.find((row) => row.actorId === 'mc-tech');
  assert.equal(raid.partyDamage, 1_500_000);
  assert.equal(mc?.total, 1_500_000);
  assert.equal(mc?.breakdown.other, 1_500_000);
});

test('Fated Chain without an observed individual actor stays party-only', () => {
  const observation = parse(record(FATED_CHAIN, { scenario: [
    { cmd: 'chain_cutin' },
    { cmd: 'loop_damage', to: 'boss', list: [[{ value: 60 }, { value: 40 }]] },
  ] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, undefined);
  assert.equal(observation.actions[0]?.kind, 'other');
  assert.equal(observation.actions[0]?.name, 'Fated Chain');

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  assert.equal(raid.partyDamage, 100);
  assert.deepEqual(raid.characterDamage, []);
});

test('unknown damage-bearing boss commands are retained and mark parsing partial', () => {
  const observation = parse(record(ABILITY, { scenario: [
    { cmd: 'future_damage_shape', to: 'boss', list: [{ value: 77 }] },
  ] }));

  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.actorId, undefined);
  assert.equal(observation.actions[0]?.hits[0]?.amount, 77);
  assert.equal(observation.unparsedActionCount, 1);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  assert.equal(raid.partyDamage, 77);
  assert.equal(raid.coverage.parseGapObserved, true);
  assert.equal(raid.damageQuality, 'partial');
});
