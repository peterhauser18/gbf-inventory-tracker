import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRaidHistoryComparison, observedContributors } from './comparison.ts';
import type { RaidHistoryRecord } from './types.ts';

function raid(id: string, localId: string, overrides: Partial<RaidHistoryRecord> = {}): RaidHistoryRecord {
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
    drops: [], dropsQuality: 'known', coverage: {}, lastObservedAt: 10, localId, source: 'captured', favorite: false,
    ...overrides,
  };
}

test('compares only records for the same technical raid identity', () => {
  assert.equal(buildRaidHistoryComparison(raid('r1', 'a'), raid('r2', 'b')), null);
  assert.equal(buildRaidHistoryComparison(raid('r1', 'a'), raid('r1', 'b'))?.raidTechnicalId, 'r1');
});

test('derives deltas only when both compared values are known', () => {
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
});

test('does not derive party damage, per-turn or honors deltas from partial quality values', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a', { damageQuality: 'partial', partyDamage: 1000, participants: { honors: 100, quality: 'partial' } }),
    raid('r1', 'b', { damageQuality: 'known', partyDamage: 1600, participants: { honors: 250, quality: 'known' }, lastObservedTurn: 4 }),
  )!;
  const partyDamage = comparison.metrics.find((row) => row.key === 'party-damage');
  const perTurn = comparison.metrics.find((row) => row.key === 'damage-per-observed-turn');
  const honors = comparison.metrics.find((row) => row.key === 'honors');
  assert.equal(partyDamage?.left, undefined);
  assert.equal(partyDamage?.delta, undefined);
  assert.equal(perTurn?.left, undefined);
  assert.equal(perTurn?.delta, undefined);
  assert.equal(honors?.left, undefined);
  assert.equal(honors?.delta, undefined);
});

test('does not turn partial damage breakdown into a numeric comparison', () => {
  const comparison = buildRaidHistoryComparison(
    raid('r1', 'a'),
    raid('r1', 'b', { damageQuality: 'partial' }),
  )!;
  assert.equal(comparison.metrics.find((row) => row.key === 'normal-damage')?.right, undefined);
  assert.equal(comparison.metrics.find((row) => row.key === 'normal-damage')?.delta, undefined);
  assert.equal(comparison.contributors.quality, 'partial');
});

test('reports only observed contributors and preserves differences without claiming a full party', () => {
  const right = raid('r1', 'b', {
    characterDamage: [{ actorId: '3040000001', actorName: 'Beta', total: 900, breakdown: { normal: 900 }, quality: 'known' }],
    log: [
      { observedAt: 1, actorId: '3040000001', actorName: 'Beta', actionKind: 'normal', damage: 900, breakdown: { normal: 900 } },
      { observedAt: 2, actorId: '3040000000', actorName: 'Alpha', actionKind: 'skill', damage: 100, breakdown: { skill: 100 } },
    ],
  });
  assert.deepEqual(observedContributors(right).map((row) => row.label), ['Alpha', 'Beta']);
  const comparison = buildRaidHistoryComparison(raid('r1', 'a'), right)!;
  assert.deepEqual(comparison.contributors.common.map((row) => row.label), ['Alpha']);
  assert.deepEqual(comparison.contributors.rightOnly.map((row) => row.label), ['Beta']);
  assert.deepEqual(comparison.contributors.leftOnly, []);
});
