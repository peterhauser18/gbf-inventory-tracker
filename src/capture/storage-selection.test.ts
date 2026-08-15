import assert from 'node:assert/strict';
import test from 'node:test';
import { selectLatestCompletedScan } from './storage.ts';
import type { CaptureScanSummary } from './types.ts';

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
