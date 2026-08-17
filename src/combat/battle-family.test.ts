import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyObservedResponseUrl } from '../capture/route.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  isVerifiedCombatResponseUrl,
  parseVerifiedMultiraidObservation,
} from './multiraid.ts';

const ORIGIN = 'https://game.granbluefantasy.jp';
const SHARED_FAMILIES = [
  'start.json',
  'normal_attack_result.json',
  'ability_result.json',
  'summon_result.json',
  'temporary_item_result.json',
] as const;

function record(url: string, body: unknown, capturedAt = 10): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function startBody(): Record<string, unknown> {
  return {
    quest_id: 'trial-quest',
    raid_id: 'trial-instance',
    quest_name: 'Synthetic Trial',
    turn: 1,
    is_host: true,
    boss: {
      param: [{ enemy_id: 'trial-boss', name: { en: 'Synthetic Boss' }, hp: 1000, hpmax: 1000 }],
    },
    player: {
      param: [{ pid: 'mc-tech', name: 'MC', hp: 100, hpmax: 100, alive: true }],
    },
  };
}

function parseStart(prefix: 'raid' | 'multiraid') {
  return parseVerifiedMultiraidObservation(
    record(`${ORIGIN}/rest/${prefix}/start.json`, startBody()),
  );
}

test('verified shared battle families accept both raid and multiraid exact paths', () => {
  for (const family of SHARED_FAMILIES) {
    const raidUrl = `${ORIGIN}/rest/raid/${family}`;
    const multiraidUrl = `${ORIGIN}/rest/multiraid/${family}`;
    assert.equal(isVerifiedCombatResponseUrl(raidUrl), true, `raid ${family}`);
    assert.equal(isVerifiedCombatResponseUrl(multiraidUrl), true, `multiraid ${family}`);
    assert.equal(classifyObservedResponseUrl(raidUrl), 'combat', `routed raid ${family}`);
    assert.equal(classifyObservedResponseUrl(multiraidUrl), 'combat', `routed multiraid ${family}`);
  }

  assert.equal(isVerifiedCombatResponseUrl(`${ORIGIN}/rest/multiraid/multi_member_info`), true);
  assert.equal(isVerifiedCombatResponseUrl(`${ORIGIN}/rest/raid/multi_member_info`), false);
  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/raid/multi_member_info`), null);
  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/raid/unknown_result.json`), null);
  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/multiraid/unknown_result.json`), null);
  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/raid/nested/ability_result.json`), null);
});

test('raid start initializes the same normalized context as multiraid start', () => {
  const raid = parseStart('raid');
  const multi = parseStart('multiraid');
  assert.ok(raid);
  assert.ok(multi);

  assert.equal(raid.raidTechnicalId, 'trial-quest');
  assert.equal(raid.raidName, 'Synthetic Trial');
  assert.equal(raid.startObserved, true);
  assert.equal(raid.boss?.id, 'trial-boss');
  assert.equal(raid.context?.instanceId, 'trial-instance');
  assert.equal(raid.context?.actorSlots[0]?.id, 'mc-tech');

  assert.deepEqual(raid, multi);
});

test('raid action responses reuse the existing scenario parser', () => {
  const start = parseStart('raid');
  assert.ok(start?.context);

  const ability = parseVerifiedMultiraidObservation(record(`${ORIGIN}/rest/raid/ability_result.json`, {
    scenario: [
      { cmd: 'ability', pos: 0, name: 'Synthetic Skill' },
      { cmd: 'damage', to: 'boss', list: [{ value: 123 }] },
      { cmd: 'boss_gauge', hp: 877, hpmax: 1000 },
    ],
  }, 20), start.context);

  assert.ok(ability);
  assert.equal(ability.actions.length, 1);
  assert.equal(ability.actions[0]?.actorId, 'mc-tech');
  assert.equal(ability.actions[0]?.kind, 'skill');
  assert.equal(ability.actions[0]?.name, 'Synthetic Skill');
  assert.equal(ability.actions[0]?.hits[0]?.amount, 123);
  assert.equal(ability.boss?.hp, 877);
});
