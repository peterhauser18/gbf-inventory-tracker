import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeVerifiedMultiraidObservation, parseVerifiedMultiraidObservation, type CombatParseContext } from './multiraid.ts';
import { enrichVerifiedScenarioSemantics, preserveVerifiedNormalFacts } from './verified-combat-semantics.ts';

const ATTACK = 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json';

function record(body: unknown, capturedAt = 1) {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url: ATTACK, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  } as never;
}

function context(): CombatParseContext {
  return { raidTechnicalId: '777001', instanceId: 'instance-a', actorSlots: [{ id: 'mc-tech', name: 'MC' }] };
}

test('verified flurry plus echo fixture preserves lane facts, classifies echo, and deduplicates crit', () => {
  const body = { scenario: [{
    cmd: 'attack', from: 'player', pos: 0, total_attack_num: 3,
    damage: [[
      { value: 588476, critical: true, attack_count: 0, concurrent_attack_count: 0, is_random_attack: true },
      { value: 211682, critical: true, attack_count: 0, concurrent_attack_count: 1, is_random_attack: true },
      { value: 588212, critical: true, attack_count: 0, concurrent_attack_count: 0, is_random_attack: true },
      { value: 211622, critical: true, attack_count: 0, concurrent_attack_count: 1, is_random_attack: true },
    ]],
  }] };
  const observation = parseVerifiedMultiraidObservation(record(body), context());
  assert.ok(observation);
  enrichVerifiedScenarioSemantics(body, observation);
  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.critical, true);
  assert.deepEqual(observation.actions[0]?.hits.map((hit) => hit.kind), ['normal', 'echo', 'normal', 'echo']);

  const parse = mergeVerifiedMultiraidObservation(null, observation);
  preserveVerifiedNormalFacts(parse, observation.actions);
  assert.equal(parse.partyDamage, 1_599_992);
  assert.deepEqual(parse.log[0]?.breakdown, { normal: 1_176_688, echo: 423_304 });
  assert.equal(parse.log[0]?.critical, true);
  assert.equal(parse.stats.criticalHits, 1);
  assert.equal(parse.log[0]?.multiattack, 3);
  assert.deepEqual(parse.log[0]?.damageInstances?.map((hit) => ({
    attackCount: hit.attackCount,
    concurrentAttackCount: hit.concurrentAttackCount,
    isRandomAttack: hit.isRandomAttack,
    critical: hit.critical,
    kind: hit.kind,
  })), [
    { attackCount: 0, concurrentAttackCount: 0, isRandomAttack: true, critical: true, kind: 'normal' },
    { attackCount: 0, concurrentAttackCount: 1, isRandomAttack: true, critical: true, kind: 'echo' },
    { attackCount: 0, concurrentAttackCount: 0, isRandomAttack: true, critical: true, kind: 'normal' },
    { attackCount: 0, concurrentAttackCount: 1, isRandomAttack: true, critical: true, kind: 'echo' },
  ]);
});

test('verified ambiguous concurrent pair stays other rather than being mislabeled echo', () => {
  const body = { scenario: [{
    cmd: 'attack', from: 'player', pos: 0, total_attack_num: 1,
    damage: [[
      { value: 916989, critical: true, attack_count: 0, concurrent_attack_count: 0 },
      { value: 920515, critical: true, attack_count: 0, concurrent_attack_count: 1 },
    ]],
  }] };
  const observation = parseVerifiedMultiraidObservation(record(body, 2), context());
  assert.ok(observation);
  enrichVerifiedScenarioSemantics(body, observation);
  const parse = mergeVerifiedMultiraidObservation(null, observation);
  preserveVerifiedNormalFacts(parse, observation.actions);
  assert.equal(parse.partyDamage, 1_837_504);
  assert.deepEqual(parse.log[0]?.breakdown, { normal: 916989, other: 920515 });
  assert.equal(parse.log[0]?.breakdown.echo, undefined);
  assert.equal(parse.log[0]?.critical, true);
  assert.equal(parse.stats.criticalHits, 1);
});
