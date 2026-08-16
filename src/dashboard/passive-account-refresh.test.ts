import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');

test('dashboard entry tracks relevant cumulative account storage changes', () => {
  assert.match(source, /ACCOUNT_DATABASE_STORAGE_KEY/);
  assert.match(source, /chrome\.storage\.onChanged\.addListener/);
  assert.match(source, /changedAccountEvidence/);
  assert.match(source, /sectionUsesAccountEvidence/);
  assert.match(source, /dirtyEvidence/);
  assert.doesNotMatch(source, /characterObservationChanged/);
});

test('visible dashboard keeps debounced live refresh while hidden tabs flush on return', () => {
  assert.match(source, /document\.visibilityState === 'visible'\) scheduleReload\(section, 500\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
  assert.match(source, /window\.addEventListener\('focus', flushDirtyEvidence\)/);
  assert.match(source, /sectionUsesAccountEvidence\(section, \[\.\.\.dirtyEvidence\]\)/);
  assert.match(source, /scheduleReload\(section, 0\)/);
});

test('dashboard refresh preserves the selected section after asynchronous dashboard load', () => {
  assert.match(source, /restoreSectionWhenReady/);
  assert.match(source, /new MutationObserver/);
  assert.match(source, /sessionStorage\.removeItem\(RESTORE_SECTION_KEY\)/);
});

test('dashboard bootstrap has no diagnostic scan or capture dependency', () => {
  assert.doesNotMatch(source, /getLatestCompletedCaptureScan/);
  assert.doesNotMatch(source, /getCapturedResponsesForScan/);
});
