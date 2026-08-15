import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
} from './multiraid.ts';

function record(body: unknown, capturedAt: number, url: string): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

const START = 'https://game.granbluefantasy.jp/rest/multiraid/start.json';
const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';
const ABILITY = 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json';
const SUMMON = 'https://game.granbluefantasy.jp/rest/multiraid/summon_result.json';
const ITEM = 'https://game.granbluefantasy.jp/rest/multiraid/temporary_item_result.json';
const MEMBERS = 'https://game.granbluefantasy.jp/rest/multiraid/multi_member_info';

function context(): CombatParseContext {
  return {
    raidTechnicalId: '777001',
    instanceId: 'instance-a',
    actorSlots: [
      { id: 'mc-tech', name: 'MC' },
      { id: 'char-tech', name: 'Ally' },
    ],
  };
}

test('verified start snapshot persists quest id as raid type and keeps a mid-raid snapshot partial', () => {
  const observation = parseVerifiedMultiraidObservation(record({
    raid_id: 'instance-a',
    quest_id: 777001,
    is_host: true,
    turn: 7,
    boss: { param: [{ enemy_id: 'boss-77', name: { en: 'Synthetic Raid Boss' }, hp: '500', hpmax: 1000 }] },
    player: { param: [
      { pid: 'mc-tech', name: 'MC' },
      { pid: 'char-tech', name: 'Ally' },
    ] },
  }, 10, START));

  assert.ok(observation);
  assert.equal(observation.raidTechnicalId, '777001');
  assert.equal(observation.startObserved, false);
  assert.equal(observation.role, 'host');
  assert.equal(observation.context?.instanceId, 'instance-a');
  assert.deepEqual(observation.context?.actorSlots, context().actorSlots);

  const parse = mergeVerifiedMultiraidObservation(null, observation);
  assert.equal(parse.observedStartedAt, undefined);
  assert.equal(parse.parserQuality, 'partial');
  assert.equal(parse.boss?.id, 'boss-77');
  assert.equal(parse.boss?.hpPercent, 50);
  assert.equal('instanceId' in parse, false);
});

test('verified attack scenario groups player hits, attributes skill damage, excludes boss attacks and accumulates contribution as partial', () => {
  const start = parseVerifiedMultiraidObservation(record({
    raid_id: 'instance-a', quest_id: 777001, turn: 7,
    boss: { param: [{ enemy_id: 'boss-77', hp: 1000, hpmax: 1000 }] },
    player: { param: context().actorSlots.map((actor) => ({ pid: actor.id, name: actor.name })) },
  }, 10, START));
  assert.ok(start);
  let parse = mergeVerifiedMultiraidObservation(null, start);

  const observation = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'contribution', amount: 500 },
    { cmd: 'attack', from: 'player', pos: 0, total_attack_num: 3, damage: [[
      { value: 100, critical: true }, { value: 110 }, { value: 90 },
    ]] },
    { cmd: 'ability', pos: 1, num: 1, name: 'Synthetic Skill', to: 'player' },
    { cmd: 'damage', to: 'boss', list: [{ value: 300, hp: 400 }] },
    { cmd: 'boss_gauge', pos: 0, name: { en: 'Synthetic Raid Boss' }, hp: 400 },
    { cmd: 'attack', from: 'boss', pos: 0, damage: [[{ value: 9999 }]] },
  ] }, 20, ATTACK), start.context);
  assert.ok(observation);

  parse = mergeVerifiedMultiraidObservation(parse, observation);
  assert.equal(parse.partyDamage, 600);
  assert.equal(parse.characterDamage.find((row) => row.actorId === 'mc-tech')?.breakdown.normal, 300);
  assert.equal(parse.characterDamage.find((row) => row.actorId === 'char-tech')?.breakdown.skill, 300);
  assert.equal(parse.stats.attackActions, 1);
  assert.equal(parse.stats.multiattacks, 1);
  assert.equal(parse.stats.skillsUsed, 1);
  assert.equal(parse.stats.criticalHits, 1);
  assert.equal(parse.participants?.contribution, 500);
  assert.equal(parse.participants?.quality, 'partial');
  assert.equal(parse.boss?.hp, 400);
  assert.equal(parse.boss?.hpPercent, 40);
});

test('verified special and ability scenarios parse ougi/skill damage without inventing echo and prove terminal victory', () => {
  const ctx = context();
  const special = parseVerifiedMultiraidObservation(record({ scenario: [{
    cmd: 'special', target: 'boss', pos: 0, name: 'Synthetic CA',
    concurrent_attack_count: 2,
    list: [{ damage: [{ value: 1000, critical: true }, { value: 200 }] }],
  }] }, 30, ATTACK), ctx);
  assert.ok(special);
  let parse = mergeVerifiedMultiraidObservation(null, special);
  assert.equal(parse.partyDamage, 1200);
  assert.equal(parse.log[0]?.actionKind, 'ougi');
  assert.deepEqual(parse.log[0]?.breakdown, { ougi: 1200 });
  assert.equal(parse.log[0]?.breakdown.echo, undefined);

  const ability = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'ability', pos: 1, num: 1, name: 'Synthetic Burst', to: 'player' },
    { cmd: 'loop_damage', to: 'boss', list: [[{ value: 50 }, { value: 60 }]] },
    { cmd: 'die', to: 'boss', pos: 0 },
    { cmd: 'drop', pos: 0, list: [3, 4] },
    { cmd: 'win' },
  ] }, 40, ABILITY), ctx);
  assert.ok(ability);
  assert.equal(ability.result, 'victory');
  assert.equal(ability.dropsQuality, 'unknown');
  parse = mergeVerifiedMultiraidObservation(parse, ability);
  assert.equal(parse.partyDamage, 1310);
  assert.equal(parse.result, 'victory');
  assert.equal(parse.characterDamage.find((row) => row.actorId === 'char-tech')?.breakdown.skill, 110);
  assert.deepEqual(parse.drops, []);
});

test('verified summon damage stays unattributed and temporary item responses do not invent damage', () => {
  const ctx = context();
  const summon = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'summon', name: 'Synthetic Summon', list: [{ damage: [{ value: 700, critical: true }] }] },
    { cmd: 'boss_gauge', hp: 300 },
  ] }, 50, SUMMON), ctx);
  assert.ok(summon);
  const summonParse = mergeVerifiedMultiraidObservation(null, summon);
  assert.equal(summonParse.partyDamage, 700);
  assert.equal(summonParse.log[0]?.actionKind, 'summon');
  assert.equal(summonParse.log[0]?.actorId, undefined);
  assert.deepEqual(summonParse.log[0]?.breakdown, { other: 700 });

  const item = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'ability', pos: 0, name: '' },
    { cmd: 'boss_gauge', hp: 250 },
  ] }, 60, ITEM), ctx);
  assert.ok(item);
  assert.deepEqual(item.actions, []);
  assert.equal(item.boss?.hp, 250);
});

test('verified result rewards keep technical item ids and raw buckets, including known empty rewards', () => {
  const ctx = context();
  const reward = parseVerifiedMultiraidObservation(record({
    option: { result_data: { rewards: { reward_list: {
      3: { '10_629': { id: '629', item_kind: 10, name: 'Synthetic Core', count: '2' } },
      4: [],
    } } } },
  }, 70, 'https://game.granbluefantasy.jp/resultmulti/content/index/instance-a'), ctx);
  assert.ok(reward);
  assert.equal(reward.dropsQuality, 'known');
  assert.deepEqual(reward.drops, [
    { itemId: '10:629', name: 'Synthetic Core', quantity: 2, chest: '3' },
  ]);

  const terminal = mergeVerifiedMultiraidObservation(null, {
    raidTechnicalId: ctx.raidTechnicalId,
    observedAt: 69,
    startObserved: false,
    result: 'victory',
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops: [],
    dropsQuality: 'unknown',
    context: ctx,
  });
  const parse = mergeVerifiedMultiraidObservation(terminal, reward);
  assert.equal(parse.result, 'victory');
  assert.equal(parse.observedEndedAt, 69);
  assert.equal('instanceId' in parse, false);

  const empty = parseVerifiedMultiraidObservation(record({
    option: { result_data: { rewards: { reward_list: { 1: [], 2: [] } } } },
  }, 71, 'https://game.granbluefantasy.jp/resultmulti/content/index/instance-a'), ctx);
  assert.ok(empty);
  assert.equal(empty.dropsQuality, 'known');
  assert.deepEqual(empty.drops, []);

  assert.equal(parseVerifiedMultiraidObservation(record({
    option: { result_data: { rewards: { reward_list: { 1: [] } } } },
  }, 72, 'https://game.granbluefantasy.jp/resultmulti/content/index/other-instance'), ctx), null);
});

test('verified member snapshot retains only count and a new same-type raid instance resets prior combat state', () => {
  const ctx = context();
  const members = parseVerifiedMultiraidObservation(record({
    multi_member_info: [
      { user_id: '<redacted>', viewer_id: '<redacted>', name: 'Not persisted' },
      { user_id: '<redacted>', viewer_id: '<redacted>', name: 'Not persisted either' },
    ],
    mvp_info: [{ rank: 1, point: 999, name: 'Also not persisted' }],
  }, 80, MEMBERS), ctx);
  assert.ok(members);
  assert.deepEqual(members.participants, { count: 2, quality: 'known' });
  assert.equal(JSON.stringify(members).includes('Not persisted'), false);

  const oldAction = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 10 }]] },
  ] }, 81, ATTACK), ctx);
  assert.ok(oldAction);
  const old = mergeVerifiedMultiraidObservation(null, oldAction);
  assert.equal(old.partyDamage, 10);

  const next = parseVerifiedMultiraidObservation(record({
    raid_id: 'instance-b', quest_id: 777001, turn: 4,
    boss: { param: [{ enemy_id: 'boss-77', hp: 900, hpmax: 1000 }] },
    player: { param: [{ pid: 'new', name: 'New' }] },
  }, 90, START), ctx);
  assert.ok(next);
  assert.equal(next.forceNewRaid, true);
  assert.equal(next.context?.instanceId, 'instance-b');
  const reset = mergeVerifiedMultiraidObservation(old, next);
  assert.equal(reset.partyDamage, undefined);
  assert.deepEqual(reset.log, []);
});

test('verified action families require existing passive raid context instead of request data', () => {
  assert.equal(parseVerifiedMultiraidObservation(record({
    scenario: [{ cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 10 }]] }],
  }, 100, ATTACK)), null);
});
