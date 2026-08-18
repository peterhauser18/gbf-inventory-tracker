import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyObservedResponseUrl } from '../capture/route.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  isVerifiedCombatResponseUrl,
  parseVerifiedMultiraidObservation,
} from './complete-observation.ts';

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

function raidIdOnlyStartBody(): Record<string, unknown> {
  const body = startBody();
  delete body.quest_id;
  return body;
}

function parseStart(prefix: 'raid' | 'multiraid') {
  return parseVerifiedMultiraidObservation(
    record(`${ORIGIN}/rest/${prefix}/start.json`, startBody()),
  );
}

test('verified shared battle families route through the current complete-observation boundary', () => {
  for (const family of SHARED_FAMILIES) {
    const raidUrl = `${ORIGIN}/rest/raid/${family}`;
    const multiraidUrl = `${ORIGIN}/rest/multiraid/${family}`;
    assert.equal(isVerifiedCombatResponseUrl(raidUrl), true, `raid ${family}`);
    assert.equal(isVerifiedCombatResponseUrl(multiraidUrl), true, `multiraid ${family}`);
    assert.equal(classifyObservedResponseUrl(raidUrl), 'combat', `routed raid ${family}`);
    assert.equal(classifyObservedResponseUrl(multiraidUrl), 'combat', `routed multiraid ${family}`);
  }

  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/multiraid/fatal_chain_result.json`), 'combat');
  assert.equal(classifyObservedResponseUrl(`${ORIGIN}/rest/multiraid/multi_member_info`), 'combat');
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

test('raid start can initialize from a verified raid_id when quest_id is absent', () => {
  const start = parseVerifiedMultiraidObservation(
    record(`${ORIGIN}/rest/raid/start.json`, raidIdOnlyStartBody()),
  );
  assert.ok(start);
  assert.equal(start.raidTechnicalId, 'trial-instance');
  assert.equal(start.context?.instanceId, 'trial-instance');
  assert.equal(start.context?.actorSlots[0]?.id, 'mc-tech');

  const ability = parseVerifiedMultiraidObservation(
    record(`${ORIGIN}/rest/raid/ability_result.json`, {
      scenario: [
        { cmd: 'ability', pos: 0, name: 'Synthetic Trial Battle Skill' },
        { cmd: 'damage', to: 'boss', list: [{ value: 321 }] },
      ],
    }, 20),
    start.context,
  );
  assert.ok(ability);
  assert.equal(ability.raidTechnicalId, 'trial-instance');
  assert.equal(ability.actions[0]?.actorId, 'mc-tech');
  assert.equal(ability.actions[0]?.hits[0]?.amount, 321);

  const missingIds = raidIdOnlyStartBody();
  delete missingIds.raid_id;
  assert.equal(
    parseVerifiedMultiraidObservation(record(`${ORIGIN}/rest/raid/start.json`, missingIds)),
    null,
  );
});

test('raid action families reuse the same complete-observation parser as multiraid', () => {
  const cases = [
    {
      family: 'normal_attack_result.json',
      body: {
        scenario: [{ cmd: 'attack', from: 'player', pos: 0, total_attack_num: 1, damage: [{ value: 101 }] }],
      },
    },
    {
      family: 'ability_result.json',
      body: {
        scenario: [
          { cmd: 'ability', pos: 0, name: 'Synthetic Skill' },
          { cmd: 'damage', to: 'boss', list: [{ value: 123 }] },
          { cmd: 'boss_gauge', hp: 877, hpmax: 1000 },
        ],
      },
    },
    {
      family: 'summon_result.json',
      body: {
        scenario: [{ cmd: 'summon', name: 'Synthetic Summon', list: [{ value: 50 }] }],
      },
    },
    {
      family: 'temporary_item_result.json',
      body: {
        scenario: [{ cmd: 'heal', target: 'player', list: [{ pos: 0, hp: 90 }] }],
      },
    },
  ] as const;

  for (const value of cases) {
    const raidStart = parseStart('raid');
    const multiStart = parseStart('multiraid');
    assert.ok(raidStart?.context);
    assert.ok(multiStart?.context);

    const raid = parseVerifiedMultiraidObservation(
      record(`${ORIGIN}/rest/raid/${value.family}`, value.body, 20),
      raidStart.context,
    );
    const multi = parseVerifiedMultiraidObservation(
      record(`${ORIGIN}/rest/multiraid/${value.family}`, value.body, 20),
      multiStart.context,
    );

    assert.ok(raid, `raid ${value.family}`);
    assert.ok(multi, `multiraid ${value.family}`);
    assert.deepEqual(raid, multi, value.family);
  }
});
