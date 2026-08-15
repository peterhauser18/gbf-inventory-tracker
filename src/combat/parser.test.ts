import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCombatObservation, parseCombatObservation } from './parser.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';

function record(body: unknown, capturedAt: number, url = 'https://game.granbluefantasy.jp/battle/raid/result'): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

test('parses deterministic normal/skill/ougi/echo/supplemental damage without double counting', () => {
  const start = parseCombatObservation(record({
    raid: { technicalId: 'raid-101', name: 'Synthetic Dragon', role: 'host', started: true },
    boss: { id: 'boss-1', name: 'Dragon', hp: 1000000, maxHp: 1000000 },
    combat: { actions: [
      { actor: { id: 'c1', name: 'A' }, type: 'attack', turn: 1, multiattack: 2, hits: [
        { damage: 100, kind: 'normal', target_id: 'boss-1', critical: true },
        { damage: 110, kind: 'normal', target_id: 'boss-1' },
        { damage: 20, kind: 'echo', target_id: 'boss-1' },
        { damage: 5, kind: 'supplemental', target_id: 'boss-1' },
      ] },
      { actor: { id: 'c2', name: 'B' }, type: 'skill', name: 'Skill', hits: [{ damage: 300 }, { damage: 300 }] },
      { actor: { id: 'c1', name: 'A' }, type: 'ougi', name: 'CA', damage: 1000 },
    ] },
    participants: { count: 4, honors: 12345 },
  }, 1000));
  assert.ok(start);
  let parse = mergeCombatObservation(null, start);
  assert.equal(parse.partyDamage, 1835);
  assert.equal(parse.damageQuality, 'partial');
  assert.equal(parse.characterDamage.find((entry) => entry.actorId === 'c1')?.total, 1235);
  assert.deepEqual(parse.characterDamage.find((entry) => entry.actorId === 'c1')?.breakdown, {
    normal: 210, echo: 20, supplemental: 5, ougi: 1000,
  });
  assert.equal(parse.stats.attackActions, 1);
  assert.equal(parse.stats.multiattacks, 1);
  assert.equal(parse.stats.criticalHits, 1);
  assert.equal(parse.stats.skillsUsed, 1);
  assert.equal(parse.stats.ougisUsed, 1);
  assert.equal(parse.boss?.hpPercent, 100);
  assert.equal(parse.participants?.honors, 12345);

  const end = parseCombatObservation(record({
    raid: { technicalId: 'raid-101', name: 'Synthetic Dragon' },
    boss: { id: 'boss-1', hp: 0, maxHp: 1000000 },
    result: { status: 'victory', rewardsComplete: true, rewards: [
      { item_id: 'item-a', name: 'Rare Claw', quantity: 1, chest: 'blue' },
      { chest: 'red', items: [{ item_id: 'item-b', name: 'Stone', quantity: 2 }] },
    ] },
  }, 5000));
  assert.ok(end);
  parse = mergeCombatObservation(parse, end);
  assert.equal(parse.result, 'victory');
  assert.equal(parse.resultQuality, 'known');
  assert.equal(parse.damageQuality, 'known');
  assert.equal(parse.parserQuality, 'known');
  assert.equal(parse.durationMs, 4000);
  assert.equal(parse.boss?.hp, 0);
  assert.equal(parse.dropsQuality, 'known');
  assert.deepEqual(parse.drops, [
    { itemId: 'item-a', name: 'Rare Claw', quantity: 1, chest: 'blue' },
    { itemId: 'item-b', name: 'Stone', quantity: 2, chest: 'red' },
  ]);
});

test('late join remains partial and missing events never become zero', () => {
  const observation = parseCombatObservation(record({
    raid: { technicalId: 'raid-202', name: 'Late Join' },
    combat: { actions: [{ actor_id: 'c9', type: 'skill', hits: [{ damage: 777 }] }] },
    boss: { hp: 500, maxHp: 1000 },
  }, 2000));
  assert.ok(observation);
  const parse = mergeCombatObservation(null, observation);
  assert.equal(parse.damageQuality, 'partial');
  assert.equal(parse.partyDamage, 777);
  assert.equal(parse.characterDamage[0]?.breakdown.skill, 777);
  assert.equal(parse.characterDamage[0]?.breakdown.normal, undefined);
  assert.equal(parse.stats.multiattacks, undefined);
  assert.equal(parse.dropsQuality, 'unknown');
});

test('multi-target hits remain one observed total with target evidence', () => {
  const observation = parseCombatObservation(record({
    raid: { technicalId: 'raid-303' },
    combat: { start: true, actions: [{ actor_id: 'c1', type: 'skill', targets: [
      { id: 't1', damage: 100 },
      { id: 't2', hits: [{ damage: 150 }, { damage: 50, kind: 'echo' }] },
    ] }] },
  }, 3000));
  assert.ok(observation);
  const parse = mergeCombatObservation(null, observation);
  assert.equal(parse.partyDamage, 300);
  assert.deepEqual(parse.log[0]?.targetIds?.sort(), ['t1', 't2']);
  assert.equal(parse.log[0]?.breakdown.skill, 250);
  assert.equal(parse.log[0]?.breakdown.echo, 50);
});

test('a new run of the same raid type does not inherit the completed run', () => {
  const firstStart = parseCombatObservation(record({
    raid: { technicalId: 'raid-repeat', started: true },
    combat: { actions: [{ actor_id: 'c1', type: 'attack', damage: 100 }] },
  }, 1000));
  assert.ok(firstStart);
  let parse = mergeCombatObservation(null, firstStart);

  const firstEnd = parseCombatObservation(record({
    raid: { technicalId: 'raid-repeat' },
    result: { status: 'victory', rewardsComplete: true, rewards: [{ item_id: 'old-drop', quantity: 1 }] },
  }, 2000));
  assert.ok(firstEnd);
  parse = mergeCombatObservation(parse, firstEnd);
  assert.equal(parse.result, 'victory');
  assert.equal(parse.partyDamage, 100);
  assert.equal(parse.drops[0]?.itemId, 'old-drop');

  const secondStart = parseCombatObservation(record({
    raid: { technicalId: 'raid-repeat', started: true },
    combat: { actions: [{ actor_id: 'c2', type: 'skill', damage: 250 }] },
  }, 3000));
  assert.ok(secondStart);
  parse = mergeCombatObservation(parse, secondStart);
  assert.equal(parse.result, 'active');
  assert.equal(parse.resultQuality, 'unknown');
  assert.equal(parse.partyDamage, 250);
  assert.equal(parse.log.length, 1);
  assert.deepEqual(parse.drops, []);
  assert.equal(parse.dropsQuality, 'unknown');
  assert.equal(parse.observedStartedAt, 3000);
});

test('complete empty rewards are preserved as a known zero-drop observation', () => {
  const reward = parseCombatObservation(record({
    raid: { technicalId: 'raid-empty' },
    result: { status: 'victory', rewardsComplete: true, rewards: [] },
  }, 4000));
  assert.ok(reward);
  const parse = mergeCombatObservation(null, reward);
  assert.equal(parse.result, 'victory');
  assert.equal(parse.dropsQuality, 'known');
  assert.deepEqual(parse.drops, []);
});

test('unsupported and non-combat payloads are ignored instead of inventing state', () => {
  assert.equal(parseCombatObservation(record({ raid: { technicalId: 'x' } }, 1, 'https://game.granbluefantasy.jp/inventory/list')), null);
  assert.equal(parseCombatObservation(record({ status: 'ok' }, 1)), null);
});
