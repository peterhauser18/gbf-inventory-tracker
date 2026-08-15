import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCapturePrunePlan, selectLatestCompletedScan } from './storage.ts';
import type { CaptureScanSummary, CapturedResponseRecord } from './types.ts';

function scan(id: string, startedAt: number, stoppedAt?: number): CaptureScanSummary {
  return {
    id,
    startedAt,
    stoppedAt,
    responseCount: 0,
    categories: {
      characters: false,
      weapons: false,
      summons: false,
      treasures: false,
      progression: false,
      roster: false,
    },
  };
}

function record(id: string, scanId: string): CapturedResponseRecord {
  return {
    id,
    scanId,
    meta: {
      requestId: id,
      url: 'https://game.granbluefantasy.jp/example',
      resourceType: 'xhr',
      capturedAt: 1,
    },
    body: {},
    categories: [],
  };
}

test('selects the newest completed scan and ignores a newer active scan', () => {
  const result = selectLatestCompletedScan([
    scan('completed-old', 10, 20),
    scan('active-new', 30),
    scan('completed-new', 25, 28),
  ]);
  assert.equal(result?.id, 'completed-new');
});

test('returns null when no completed scan exists', () => {
  assert.equal(selectLatestCompletedScan([scan('active', 10)]), null);
});

test('retention prunes the oldest completed scans and their associated responses', () => {
  const plan = buildCapturePrunePlan(
    [scan('oldest', 10, 11), scan('middle', 20, 21), scan('newest', 30, 31)],
    [record('r-old', 'oldest'), record('r-middle', 'middle'), record('r-new', 'newest')],
    2,
  );
  assert.deepEqual(plan, { scanIds: ['oldest'], responseIds: ['r-old'] });
});

test('retention protects the active scan while pruning completed scans first', () => {
  const plan = buildCapturePrunePlan(
    [scan('oldest-complete', 10, 11), scan('newest-complete', 20, 21), scan('active', 30)],
    [record('r-old', 'oldest-complete'), record('r-new', 'newest-complete'), record('r-active', 'active')],
    2,
    'active',
  );
  assert.deepEqual(plan, { scanIds: ['oldest-complete'], responseIds: ['r-old'] });
});

test('retention stays bounded when only stale incomplete scans are available', () => {
  const plan = buildCapturePrunePlan(
    [scan('stale-old', 10), scan('stale-new', 20), scan('active', 30)],
    [record('r-old', 'stale-old'), record('r-new', 'stale-new'), record('r-active', 'active')],
    2,
    'active',
  );
  assert.deepEqual(plan, { scanIds: ['stale-old'], responseIds: ['r-old'] });
});
