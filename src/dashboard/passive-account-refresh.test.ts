import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');

test('dashboard entry keeps live refresh for relevant rendered sections', () => {
  assert.match(source, /ACCOUNT_DATABASE_STORAGE_KEY/);
  assert.match(source, /chrome\.storage\.onChanged\.addListener/);
  assert.match(source, /changedAccountEvidence/);
  assert.match(source, /sectionUsesAccountEvidence/);
  assert.match(source, /dirtyEvidence/);
  assert.match(source, /if \(section && sectionUsesAccountEvidence\(section, changed\)\) scheduleReload\(section, 500\)/);
  assert.match(source, /scheduleReload\(targetSection, 0\)/);
  assert.doesNotMatch(source, /if \(!section \|\| sectionUsesAccountEvidence/);
  assert.doesNotMatch(source, /characterObservationChanged/);
});

test('dashboard does not auto-reload from account writes while it is still booting', () => {
  const storageListener = source.slice(
    source.indexOf('chrome.storage.onChanged.addListener'),
    source.indexOf("document.addEventListener('click'"),
  );
  assert.match(storageListener, /const section = activeSection\(\)/);
  assert.match(storageListener, /if \(section && sectionUsesAccountEvidence/);
  assert.doesNotMatch(storageListener, /!section/);
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
