import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { summarizeTurns } from './analytics.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
} from './multiraid.ts';

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

function startBody(instanceId = 'instance-a') {
  return {
    raid_id: instanceId,
    quest_id: 777001,
    turn: 1,
    player: {
      nickname: 'Caspr',
      param: [
        { pid: 'mc-tech', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000001', name: 'Front A', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000002', name: 'Front B', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000003', name: 'Front C', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000004', name: 'Back A', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000005', name: 'Back B', hp: 100, hpmax: 100, alive: 1 },
      ],
      summon: [
        { master_id: '2040001000', name: 'Synthetic Main Summon', cooldown: 0, available: true },
        { master_id: '2040002000', name: 'Synthetic Sub Summon', cooldown: 3, available: false },
      ],
    },
    multi_member_info: [
      { nickname: 'Caspr', level: 375, hp_ratio: 100, retired_flag: false, is_dead: false },
      { nickname: 'Other', level: 350, hp_ratio: 80, retired_flag: false, is_dead: false },
    ],
    mvp_info: [
      { nickname: 'Caspr', rank: 1, point: 5869473 },
      { nickname: 'Other', rank: 2, point: 2916023 },
    ],
  };
}

test('verified start makes six party slots, account name, summons and participants available immediately', () => {
  const observation = parseVerifiedMultiraidObservation(record(START, startBody(), 10));
  assert.ok(observation?.context);
  assert.equal(observation.context.actorSlots.length, 6);
  assert.equal(observation.context.mainCharacterId, 'mc-tech');
  assert.equal(observation.context.accountDisplayName, 'Caspr');
  assert.equal(observation.context.turn, 1);
  assert.deepEqual(observation.context.summons, [
    { id: '2040001000', name: 'Synthetic Main Summon', cooldown: 0, available: true, used: false },
    { id: '2040002000', name: 'Synthetic Sub Summon', cooldown: 3, available: false, used: true },
  ]);
  assert.equal(observation.participants?.count, 2);
  assert.equal(observation.context.participants?.[0]?.name, 'Caspr');
  assert.equal(observation.context.participants?.[0]?.honors, 5869473);
});

test('verified turn context attributes skills, summons and attacks without inventing turns from action count', () => {
  const start = parseVerifiedMultiraidObservation(record(START, startBody(), 10));
  assert.ok(start?.context);
  let parse = mergeVerifiedMultiraidObservation(null, start);
  let context: CombatParseContext = start.context;

  const skill = parseVerifiedMultiraidObservation(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 1, name: 'Skill One' },
    { cmd: 'damage', to: 'boss', list: [{ value: 100 }] },
  ] }, 11), context);
  assert.ok(skill?.context);
  assert.equal(skill.actions[0]?.turn, 1);
  parse = mergeVerifiedMultiraidObservation(parse, skill);
  context = skill.context;

  const summon = parseVerifiedMultiraidObservation(record(SUMMON, { scenario: [
    { cmd: 'summon', master_id: '2040001000', name: 'Synthetic Main Summon', cooldown: 9, available: false, list: [{ damage: [{ value: 200 }] }] },
  ] }, 12), context);
  assert.ok(summon?.context);
  assert.equal(summon.actions[0]?.turn, 1);
  assert.equal(summon.context.summons?.[0]?.cooldown, 9);
  assert.equal(summon.context.summons?.[0]?.used, true);
  parse = mergeVerifiedMultiraidObservation(parse, summon);
  context = summon.context;

  const attack = parseVerifiedMultiraidObservation(record(ATTACK, { scenario: [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 300 }]] },
  ] }, 13), context);
  assert.ok(attack?.context);
  assert.equal(attack.actions[0]?.turn, 1);
  assert.equal(attack.context.turn, 2);
  parse = mergeVerifiedMultiraidObservation(parse, attack);
  context = attack.context;

  const nextSkill = parseVerifiedMultiraidObservation(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 2, name: 'Skill Two' },
    { cmd: 'damage', to: 'boss', list: [{ value: 50 }] },
  ] }, 14), context);
  assert.ok(nextSkill?.context);
  assert.equal(nextSkill.actions[0]?.turn, 2);
  parse = mergeVerifiedMultiraidObservation(parse, nextSkill);

  assert.deepEqual(summarizeTurns(parse), {
    currentTurn: 2,
    currentTurnDamage: 50,
    previousTurnDamage: 600,
  });
});

test('new same-type raid instance resets raid-local party auxiliaries instead of leaking prior state', () => {
  const first = parseVerifiedMultiraidObservation(record(START, startBody('instance-a'), 10));
  assert.ok(first?.context);
  const next = parseVerifiedMultiraidObservation(record(START, {
    raid_id: 'instance-b',
    quest_id: 777001,
    turn: 4,
    player: { nickname: 'Caspr', param: [{ pid: 'mc-new' }, { pid: '3020000010', name: 'New Ally' }] },
  }, 20), first.context);
  assert.ok(next?.context);
  assert.equal(next.forceNewRaid, true);
  assert.equal(next.context.turn, 4);
  assert.equal(next.context.actorSlots[0]?.id, 'mc-new');
  assert.equal(next.context.summons, undefined);
  assert.equal(next.context.participants, undefined);
});

test('live Combat UI renders context-first party, account-name MC, one summon surface and qualified honors', () => {
  const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');

  assert.match(layouts, /const slots = view\.context\?\.actorSlots \?\? \[\]/);
  assert.match(layouts, /view\.context\?\.accountDisplayName \?\? 'Main Character'/);
  assert.match(layouts, /Party summons/);
  assert.match(layouts, /Cooldown \$\{formatNumber\(summon\.cooldown\)\}/);
  assert.doesNotMatch(layouts, /accordion\(view, 'summons', 'Summons', renderSummonStrip\(view\)\)/);
  assert.match(layouts, /const self = ownParticipant\(view\)/);
  assert.match(layouts, /≈ \$\{formatNumber\(raid\.participants\.contribution\)\} \(partial\)/);
  assert.match(layouts, /GBF Tracker does not request the Players list/);

  assert.match(storage, /accountDisplayName: safeText\(context\.accountDisplayName, 80\)/);
  assert.match(storage, /summons: context\.summons\?\.slice\(0, 6\)\.map\(sanitizeSummonContext\)/);
  assert.doesNotMatch(layouts, /\bfetch\s*\(/);
  assert.doesNotMatch(layouts, /XMLHttpRequest/);
});
