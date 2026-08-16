import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCharacterAnalysis,
  buildGlobalPinnedDrops,
  sortRaidHistoryForDisplay,
  summarizeTurns,
} from './analytics.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

function raid(): NormalizedRaidParse {
  return {
    schemaVersion: 1,
    raidTechnicalId: 'raid-1',
    raidName: 'Fixture Raid',
    result: 'active',
    resultQuality: 'known',
    parserQuality: 'known',
    damageQuality: 'known',
    partyDamage: 1510,
    characterDamage: [{
      actorId: '3040001000',
      actorName: 'Fixture Hero',
      total: 1510,
      breakdown: { normal: 600, skill: 500, ougi: 300, echo: 80, supplemental: 30 },
      quality: 'known',
    }],
    stats: { quality: 'known' },
    log: [
      { observedAt: 1, turn: 4, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'normal', damage: 100, breakdown: { normal: 100 }, multiattack: 1, criticalHits: 1 },
      { observedAt: 2, turn: 4, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'normal', damage: 200, breakdown: { normal: 200 }, multiattack: 2 },
      { observedAt: 3, turn: 5, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'normal', damage: 300, breakdown: { normal: 300 }, multiattack: 3, criticalHits: 2 },
      { observedAt: 4, turn: 5, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'skill', actionName: 'Red Skill', damage: 300, breakdown: { skill: 300 } },
      { observedAt: 5, turn: 5, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'skill', actionName: 'Red Skill', damage: 200, breakdown: { skill: 200 } },
      { observedAt: 6, turn: 5, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'ougi', actionName: 'Big Ougi', damage: 300, breakdown: { ougi: 300 } },
      { observedAt: 7, turn: 5, actorId: '3040001000', actorName: 'Fixture Hero', actionKind: 'other', damage: 110, breakdown: { echo: 80, supplemental: 30 } },
    ],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: true, terminalObserved: false, parseGapObserved: false },
    lastObservedAt: 7,
  };
}

test('builds shared per-character SA/DA/TA, crit, skill and ougi analytics', () => {
  const analysis = buildCharacterAnalysis(raid(), '3040001000');
  assert.deepEqual(analysis.single, { count: 1, damage: 100 });
  assert.deepEqual(analysis.double, { count: 1, damage: 200 });
  assert.deepEqual(analysis.triple, { count: 1, damage: 300 });
  assert.equal(analysis.criticalHits, 3);
  assert.equal(analysis.criticalDenominator, 6);
  assert.equal(analysis.criticalRate, 0.5);
  assert.deepEqual(analysis.skills, [{ name: 'Red Skill', uses: 2, damage: 500 }]);
  assert.equal(analysis.ougiUses, 1);
  assert.equal(analysis.ougiDamage, 300);
  assert.equal(analysis.breakdown.echo, 80);
  assert.equal(analysis.breakdown.supplemental, 30);
});

test('turn summary uses only directly present turn evidence', () => {
  assert.deepEqual(summarizeTurns(raid()), {
    currentTurn: 5,
    currentTurnDamage: 1010,
    previousTurnDamage: 300,
  });
  const withoutTurns = raid();
  withoutTurns.log = withoutTurns.log.map(({ turn: _turn, ...entry }) => entry);
  assert.deepEqual(summarizeTurns(withoutTurns), {});
});

test('favorites sort before normal raids while preserving newest-first order inside groups', () => {
  const base = raid();
  const rows: RaidHistoryRecord[] = [
    { ...base, localId: 'n1', source: 'captured', favorite: false, lastObservedAt: 30 },
    { ...base, localId: 'f1', source: 'captured', favorite: true, lastObservedAt: 10 },
    { ...base, localId: 'f2', source: 'captured', favorite: true, lastObservedAt: 20 },
  ];
  assert.deepEqual(sortRaidHistoryForDisplay(rows).map((entry) => entry.localId), ['f2', 'f1', 'n1']);
});

test('global pinned drops keep raid-type/item rate semantics and important state', () => {
  const base = raid();
  const rows: RaidHistoryRecord[] = [
    { ...base, localId: '1', source: 'captured', favorite: false, result: 'victory', dropsQuality: 'known', drops: [{ itemId: '10:20', name: 'Rare Drop', quantity: 1 }], lastObservedAt: 10 },
    { ...base, localId: '2', source: 'captured', favorite: false, result: 'victory', dropsQuality: 'known', drops: [], lastObservedAt: 20 },
  ];
  const pinned = buildGlobalPinnedDrops(rows, [{ raidTechnicalId: 'raid-1', pinnedItemIds: ['10:20'], importantItemIds: ['10:20'], updatedAt: 1 }]);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0]?.observedDrops, 1);
  assert.equal(pinned[0]?.eligibleRuns, 2);
  assert.equal(pinned[0]?.rate, 0.5);
  assert.equal(pinned[0]?.important, true);
});
