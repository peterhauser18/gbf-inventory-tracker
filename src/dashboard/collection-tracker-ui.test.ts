import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./collection-tracker-ui.ts', import.meta.url), 'utf8');

test('collection tracker reads the cumulative account database instead of diagnostic scans', () => {
  assert.match(source, /loadAccountDatabase\(\)/);
  assert.match(source, /account\.snapshot\.characters/);
  assert.match(source, /account\.snapshot\.quality\.characters/);
  assert.doesNotMatch(source, /getLatestCompletedCaptureScan/);
  assert.doesNotMatch(source, /getCapturedResponsesForScan/);
  assert.doesNotMatch(source, /normalizeCaptureScan/);
});
