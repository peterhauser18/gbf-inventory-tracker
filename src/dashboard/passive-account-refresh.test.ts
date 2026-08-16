import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');

test('dashboard entry refreshes Characters from passive account storage changes', () => {
  assert.match(source, /ACCOUNT_DATABASE_STORAGE_KEY/);
  assert.match(source, /chrome\.storage\.onChanged\.addListener/);
  assert.match(source, /section !== 'overview' && section !== 'characters'/);
  assert.match(source, /targetSection !== 'characters'/);
});

test('dashboard refresh preserves the selected section after asynchronous dashboard load', () => {
  assert.match(source, /restoreSectionWhenReady/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /sessionStorage\.removeItem\(RESTORE_SECTION_KEY\)/);
});

test('dashboard bootstrap has no diagnostic scan or capture dependency', () => {
  assert.doesNotMatch(source, /diagnostic/i);
  assert.doesNotMatch(source, /getLatestCompletedCaptureScan/);
  assert.doesNotMatch(source, /getCapturedResponsesForScan/);
});
