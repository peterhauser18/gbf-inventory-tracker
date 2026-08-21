import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');

test('stash metadata keeps only a short-lived tab-scoped name and returns before account persistence', () => {
  const start = background.indexOf("if (route === 'stash-meta')");
  const end = background.indexOf("if (route === 'combat')", start);
  assert.ok(start >= 0 && end > start);
  const branch = background.slice(start, end);

  assert.match(branch, /parseObservedWeaponStashName\(record\.body\)/);
  assert.match(branch, /pendingWeaponStashNames\.set\(tabId/);
  assert.match(branch, /scanId: record\.scanId/);
  assert.doesNotMatch(branch, /saveCapturedResponse|queueAccountIngest|chrome\.storage\.local/);
});

test('stash name correlation is same-tab, same-scan, bounded in time and consumed once', () => {
  const start = background.indexOf('function weaponStashIngestContext');
  const end = background.indexOf('function isWeaponStashRecord', start);
  assert.ok(start >= 0 && end > start);
  const source = background.slice(start, end);

  assert.match(source, /pendingWeaponStashNames\.get\(tabId\)/);
  assert.match(source, /pending\.scanId !== record\.scanId/);
  assert.match(source, /age > STASH_NAME_MAX_AGE_MS/);
  assert.match(source, /pendingWeaponStashNames\.delete\(tabId\)/);
  assert.match(source, /weaponStashName: pending\.name/);
});

test('stash metadata observation adds no request-generation or replay API', () => {
  assert.doesNotMatch(background, /Network\.replayXHR|Network\.loadNetworkResource|Fetch\.enable|setCacheDisabled/);
});
