import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRaidHistory, summarizeTrackedDrop, toggleTrackedItem } from './aggregate.ts';
import type { RaidHistoryRecord } from './types.ts';

function raid(id: string, dropsQuality: 'known' | 'partial' | 'unknown', drops: RaidHistoryRecord['drops'], ended: number): RaidHistoryRecord {
  return {
    schemaVersion: 1, raidTechnicalId: id, raidName: id === 'r1' ? 'Proto Bahamut' : 'Other Raid', result: 'victory',
    resultQuality: 'known', parserQuality: 'partial', damageQuality: 'unknown', characterDamage: [], stats: { quality: 'unknown' },
    log: [], drops, dropsQuality, coverage: { startObserved: false, terminalObserved: true, parseGapObserved: false },
    lastObservedAt: ended, observedEndedAt: ended, localId: `${id}:${ended}`, source: 'captured', favorite: false,
  };
}

test('personal drop rate denominator uses only eligible complete reward runs', () => {
  const raids = [
    raid('r1', 'known', [{ itemId: 'x', name: 'Gold Brick', quantity: 1, chest: 'blue' }], 1),
    raid('r1', 'known', [], 2),
    raid('r1', 'partial', [{ itemId: 'x', name: 'Gold Brick', quantity: 1 }], 3),
    raid('r2', 'known', [{ itemId: 'x', quantity: 1 }], 4),
  ];
  const summary = summarizeTrackedDrop(raids, 'r1', 'x');
  assert.equal(summary.observedDrops, 1);
  assert.equal(summary.eligibleRuns, 2);
  assert.equal(summary.quantityReceived, 1);
  assert.equal(summary.rate, 0.5);
});

test('pinned and important preferences are independent and deterministic', () => {
  const pinned = toggleTrackedItem(undefined, 'r1', 'x', 'pinned', 10);
  assert.deepEqual(pinned.pinnedItemIds, ['x']);
  assert.deepEqual(pinned.importantItemIds, []);
  const both = toggleTrackedItem(pinned, 'r1', 'x', 'important', 11);
  assert.deepEqual(both.pinnedItemIds, ['x']);
  assert.deepEqual(both.importantItemIds, ['x']);
  const unpinned = toggleTrackedItem(both, 'r1', 'x', 'pinned', 12);
  assert.deepEqual(unpinned.pinnedItemIds, []);
  assert.deepEqual(unpinned.importantItemIds, ['x']);
});

test('raid history search covers raid, date, and tracked drop only', () => {
  const raids = [raid('r1', 'known', [{ itemId: 'x', name: 'Gold Brick', quantity: 1 }], Date.UTC(2026, 7, 15)), raid('r2', 'known', [], Date.UTC(2026, 7, 16))];
  const prefs = [{ raidTechnicalId: 'r1', pinnedItemIds: ['x'], importantItemIds: [], updatedAt: 1 }];
  assert.equal(filterRaidHistory(raids, 'Proto', prefs).length, 1);
  assert.equal(filterRaidHistory(raids, '2026-08-15', prefs).length, 1);
  assert.equal(filterRaidHistory(raids, 'Gold Brick', prefs).length, 1);
  assert.equal(filterRaidHistory(raids, 'x', prefs).length, 1);
});
