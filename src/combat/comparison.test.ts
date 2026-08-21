import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRaidHistoryComparison } from './comparison.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import type { RaidHistoryRecord } from './types.ts';

type ComparableRaid = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

function raid(id: string, localId: string, overrides: Partial<ComparableRaid> = {}): ComparableRaid {
  return {
    schemaVersion: 1,
    raidTechnicalId: id,
    raidName: 'Fixture Raid',
    result: 'victory',
    resultQuality: 'known',
    parserQuality: 'known',
    damageQuality: 'known',
    partyDamage: 1000,
    durationMs: 60_000,
    lastObservedTurn: 5,
    characterDamage: [{ actorId: '3040000000', actorName: 'Alpha', total: 1000, breakdown: { normal: 500, skill: 300, ougi: 200 }, quality: 'known' }],
    participants: { honors: 100, quality: 'known' },
    stats: { quality: 'known' },
    log: [{ observedAt: 1, turn: 5, actorId: '3040000000', actorName: 'Alpha', actionKind: 'normal', damage: 500, breakdown: { normal: 500 } }],
    drops: [],
    dropsQuality: 'known',
    coverage: { startObserved: false, terminalObserved: false, parseGapObserved: false },
    lastObservedAt: 10,
    localId,
    source: 'captured',
    favorite: false,
    ...overrides,
  };
}

function loadout(): RaidLoadoutSnapshot {
  return {
    quality: 'known', observedAt: 1, updatedAt: 1, correlation: 'battle-start',
    deckId: '84',
    signature: { npcIds: [], summonIds: [] },
    partyQuality: 'known',
    party: [{ position: 0, name: 'Djeeta', frontline: true }, { position: 1, name: 'Alpha', frontline: true }],
    summonQuality: 'partial',
    summons: [{ position: 0, name: 'Bahamut', support: false }, { position: 5, name: 'Lucifer', support: true }],
    weaponGridQuality: 'known',
    weapons: [{ slot: 1, name: 'Main Sword' }, { slot: 2, name: 'Second Sword' }],
    jobName: 'Relic Buster',
    calculator: { quality: 'unknown', enhancement: {}, boosts: [] },
  };
}

test('compares only records for the same technical raid identity', () => {
  assert.equal(buildRaidHistoryComparison(raid('r1', 'a'), raid('r2', 'b')), null);
  assert.equal(buildRaidHistoryComparison(raid('r1', 'a'), raid('r1', 'b'))?.raidTechnicalId, 'r1');
});

test('marks deltas exact when both compared values are known', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a'),
    raid('r1', 'b', { partyDamage: 1600, durationMs: undefined, lastObservedTurn: 4, participants: undefined, log: [{ observedAt: 1, turn: 4, actorId: '3040000000', actorName: 'Alpha', actionKind: 'normal', damage: 500, breakdown: { normal: 500 } }] }),
  )!;
  const damage = comparison.metrics.find((row) => row.key === 'party-damage');
  const duration = comparison.metrics.find((row) => row.key === 'duration');
  const honors = comparison.metrics.find((row) => row.key === 'honors');
  const perTurn = comparison.metrics.find((row) => row.key === 'damage-per-observed-turn');
  assert.deepEqual({ left: damage?.left, right: damage?.right, delta: damage?.delta }, { left: 1000, right: 1600, delta: 600 });
  assert.equal(duration?.delta, undefined);
  assert.equal(honors?.delta, undefined);
  assert.equal(perTurn?.left, 200);
  assert.equal(perTurn?.right, 400);
  assert.equal(perTurn?.delta, 200);
  assert.equal(damage?.leftQuality, 'known');
  assert.equal(damage?.rightQuality, 'known');
  assert.equal(damage?.deltaQuality, 'known');
});

test('exposes observed partial party damage, per-turn and contribution with partial-quality deltas', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a', { damageQuality: 'partial', partyDamage: 1000, participants: { honors: 100, quality: 'partial' } }),
    raid('r1', 'b', { damageQuality: 'known', partyDamage: 1600, participants: { honors: 250, quality: 'known' }, lastObservedTurn: 4 }),
  )!;
  const partyDamage = comparison.metrics.find((row) => row.key === 'party-damage');
  const perTurn = comparison.metrics.find((row) => row.key === 'damage-per-observed-turn');
  const honors = comparison.metrics.find((row) => row.key === 'honors');
  assert.equal(partyDamage?.left, 1000);
  assert.equal(partyDamage?.leftQuality, 'partial');
  assert.equal(partyDamage?.delta, 600);
  assert.equal(partyDamage?.deltaQuality, 'partial');
  assert.equal(perTurn?.left, 200);
  assert.equal(perTurn?.leftQuality, 'partial');
  assert.equal(perTurn?.delta, 120);
  assert.equal(perTurn?.deltaQuality, 'partial');
  assert.equal(honors?.left, 100);
  assert.equal(honors?.leftQuality, 'partial');
  assert.equal(honors?.delta, 150);
  assert.equal(honors?.deltaQuality, 'partial');
});

test('exposes observed partial damage breakdown with a partial-quality delta', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a'),
    raid('r1', 'b', { damageQuality: 'partial' }),
  )!;
  const normal = comparison.metrics.find((row) => row.key === 'normal-damage');
  assert.equal(normal?.right, 500);
  assert.equal(normal?.rightQuality, 'partial');
  assert.equal(normal?.delta, 0);
  assert.equal(normal?.deltaQuality, 'partial');
  assert.equal(comparison.damageQuality, 'partial');
});

test('sums observed breakdowns from the combat log including party-level damage', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a', {
      damageQuality: 'partial',
      log: [
        { observedAt: 1, actionKind: 'normal', damage: 500, breakdown: { normal: 500 } },
        { observedAt: 2, actionKind: 'skill', damage: 200, breakdown: { skill: 200 } },
      ],
      characterDamage: [],
    }),
    raid('r1', 'b'),
  )!;
  assert.equal(comparison.metrics.find((row) => row.key === 'normal-damage')?.left, 500);
  assert.equal(comparison.metrics.find((row) => row.key === 'skill-damage')?.left, 200);
  assert.equal(comparison.metrics.find((row) => row.key === 'ougi-damage')?.left, undefined);
});

test('identifies A and B by timestamp and summarizes only available persisted loadout context', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a', { observedEndedAt: 100, loadout: loadout() }),
    raid('r1', 'b', { observedEndedAt: 200 }),
  )!;
  assert.equal(comparison.runs.left.observedAt, 100);
  assert.equal(comparison.runs.right.observedAt, 200);
  assert.deepEqual(comparison.runs.left.loadout?.party, ['Djeeta', 'Alpha']);
  assert.deepEqual(comparison.runs.left.loadout?.summons, ['Bahamut', 'Support: Lucifer']);
  assert.equal(comparison.runs.left.loadout?.deckId, '84');
  assert.doesNotMatch(JSON.stringify(comparison.runs.left.loadout), /Main Sword|weapon/i);
  assert.equal(comparison.runs.right.loadout, undefined);
});

test('does not include drop observations in comparison output', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a', { drops: [{ itemId: 'drop-a', name: 'Left Drop', quantity: 1 }] }),
    raid('r1', 'b', { drops: [{ itemId: 'drop-b', name: 'Right Drop', quantity: 2 }] }),
  )!;
  const serialized = JSON.stringify(comparison);
  assert.doesNotMatch(serialized, /drop-a|drop-b|Left Drop|Right Drop/);
});
