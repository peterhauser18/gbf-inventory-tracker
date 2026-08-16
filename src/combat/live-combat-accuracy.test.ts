import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { summarizeTurns } from './analytics.ts';
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

function parse(recordValue: CapturedResponseRecord, context?: CombatParseContext): VerifiedCombatObservation | null {
  const observation = parseVerifiedMultiraidObservation(recordValue, context);
  if (observation) enrichVerifiedScenarioSemantics(recordValue.body, observation);
  return observation;
}

function startBody(instanceId = 'instance-a') {
  return {
    raid_id: instanceId,
    quest_id: 777001,
    turn: 1,
    player: {
      param: [
        { pid: 'mc-tech', name: 'Caspr', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000001', name: 'Front A', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000002', name: 'Front B', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000003', name: 'Front C', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000004', name: 'Back A', hp: 100, hpmax: 100, alive: 1 },
        { pid: '3020000005', name: 'Back B', hp: 100, hpmax: 100, alive: 1 },
      ],
    },
    summon: [
      { id: '2040001000', name: 'Synthetic Main Summon', recast: '0', start_recast: '0' },
      { id: '2040002000', name: 'Synthetic Sub Summon A', recast: '3', start_recast: '3' },
      { id: '2040003000', name: 'Synthetic Sub Summon B', recast: '0', start_recast: '0' },
      { id: '2040004000', name: 'Synthetic Sub Summon C', recast: '0', start_recast: '0' },
      { id: '2040005000', name: 'Synthetic Sub Summon D', recast: '0', start_recast: '0' },
    ],
    summon_enable: 1,
    is_all_unavailable: false,
  };
}

test('verified start makes six party slots, account name and five party summons available immediately', () => {
  const observation = parse(record(START, startBody(), 10));
  assert.ok(observation?.context);
  assert.equal(observation.context.actorSlots.length, 6);
  assert.equal(observation.context.mainCharacterId, 'mc-tech');
  assert.equal(observation.context.accountDisplayName, 'Caspr');
  assert.equal(observation.context.turn, 1);
  assert.deepEqual(observation.context.summons, [
    { id: '2040001000', name: 'Synthetic Main Summon', cooldown: 0, available: true, used: false },
    { id: '2040002000', name: 'Synthetic Sub Summon A', cooldown: 3, available: false, used: false },
    { id: '2040003000', name: 'Synthetic Sub Summon B', cooldown: 0, available: true, used: false },
    { id: '2040004000', name: 'Synthetic Sub Summon C', cooldown: 0, available: true, used: false },
    { id: '2040005000', name: 'Synthetic Sub Summon D', cooldown: 0, available: true, used: false },
  ]);
});

test('verified turn context attributes skills, summons and attacks and refreshes summon recast by roster position', () => {
  const start = parse(record(START, startBody(), 10));
  assert.ok(start?.context);
  let raid = mergeVerifiedMultiraidObservation(null, start);
  let context: CombatParseContext = start.context;

  const skill = parse(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 1, name: 'Skill One' },
    { cmd: 'damage', to: 'boss', list: [{ value: 100 }] },
  ] }, 11), context);
  assert.ok(skill?.context);
  assert.equal(skill.actions[0]?.turn, 1);
  raid = mergeVerifiedMultiraidObservation(raid, skill);
  context = skill.context;

  const summon = parse(record(SUMMON, {
    scenario: [
      { cmd: 'summon', name: 'Synthetic Main Summon', list: [{ damage: [{ value: 200 }] }] },
    ],
    status: {
      summon: [
        { recast: '9', start_recast: '0' },
        { recast: '2', start_recast: '3' },
        { recast: '0', start_recast: '0' },
        { recast: '0', start_recast: '0' },
        { recast: '0', start_recast: '0' },
      ],
      summon_enable: 0,
      is_all_unavailable: false,
    },
  }, 12), context);
  assert.ok(summon?.context);
  assert.equal(summon.actions[0]?.turn, 1);
  assert.equal(summon.context.summons?.[0]?.cooldown, 9);
  assert.equal(summon.context.summons?.[0]?.available, false);
  assert.equal(summon.context.summons?.[0]?.used, true);
  assert.equal(summon.context.summons?.[1]?.cooldown, 2);
  raid = mergeVerifiedMultiraidObservation(raid, summon);
  context = summon.context;

  const attack = parse(record(ATTACK, { scenario: [
    { cmd: 'attack', from: 'player', pos: 0, damage: [[{ value: 300 }]] },
  ] }, 13), context);
  assert.ok(attack?.context);
  assert.equal(attack.actions[0]?.turn, 1);
  assert.equal(attack.context.turn, 2);
  raid = mergeVerifiedMultiraidObservation(raid, attack);
  context = attack.context;

  const nextSkill = parse(record(ABILITY, { scenario: [
    { cmd: 'ability', pos: 2, name: 'Skill Two' },
    { cmd: 'damage', to: 'boss', list: [{ value: 50 }] },
  ] }, 14), context);
  assert.ok(nextSkill?.context);
  assert.equal(nextSkill.actions[0]?.turn, 2);
  raid = mergeVerifiedMultiraidObservation(raid, nextSkill);

  assert.deepEqual(summarizeTurns(raid, nextSkill.context.turn), {
    currentTurn: 2,
    currentTurnDamage: 50,
    previousTurnDamage: 600,
  });
});

test('new same-type raid instance resets raid-local party auxiliaries instead of leaking prior state', () => {
  const first = parse(record(START, startBody('instance-a'), 10));
  assert.ok(first?.context);
  const next = parse(record(START, {
    raid_id: 'instance-b',
    quest_id: 777001,
    turn: 4,
    player: { param: [{ pid: 'mc-new', name: 'Caspr' }, { pid: '3020000010', name: 'New Ally' }] },
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
  const semantics = readFileSync(new URL('./verified-combat-semantics.ts', import.meta.url), 'utf8');

  assert.match(layouts, /const slots = view\.context\?\.actorSlots \?\? \[\]/);
  assert.match(layouts, /view\.context\?\.accountDisplayName \?\? 'Main Character'/);
  assert.match(layouts, /Party summons/);
  assert.match(layouts, /Cooldown \$\{formatNumber\(summon\.cooldown\)\}/);
  assert.doesNotMatch(layouts, /accordion\(view, 'summons', 'Summons', renderSummonStrip\(view\)\)/);
  assert.match(layouts, /const self = ownParticipant\(view\)/);
  assert.match(layouts, /≈ \$\{formatNumber\(raid\.participants\.contribution\)\} \(partial\)/);
  assert.match(layouts, /GBF Tracker does not request the Players list/);

  assert.match(semantics, /verifiedSummonRoster\(body\.summon\)/);
  assert.match(semantics, /Array\.isArray\(status\.summon\)/);
  assert.match(semantics, /cooldown = num\(value\.recast\)/);
  assert.match(storage, /accountDisplayName: safeText\(context\.accountDisplayName, 80\)/);
  assert.match(storage, /summons: context\.summons\?\.slice\(0, 6\)\.map\(sanitizeSummonContext\)/);
  assert.doesNotMatch(layouts, /\bfetch\s*\(/);
  assert.doesNotMatch(layouts, /XMLHttpRequest/);
});
