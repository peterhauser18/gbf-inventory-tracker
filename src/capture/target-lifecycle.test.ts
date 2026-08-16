import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
) as { permissions?: string[]; host_permissions?: string[] };

test('observation follows active tabs and focused Edge windows without attach-all discovery', () => {
  assert.match(background, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(background, /chrome\.windows\.onFocusChanged\.addListener/);
  assert.match(background, /chrome\.tabs\.query\(\{ active: true, windowId \}\)/);
  assert.match(background, /chrome\.debugger\.getTargets\(\)/);
  assert.doesNotMatch(background, /chrome\.tabs\.query\(\{[^}]*url:/);
});

test('retargeting detaches the previous target before attaching the revalidated candidate', () => {
  const start = background.indexOf('async function switchObservationTarget');
  const end = background.indexOf('async function enableNetworkObservation', start);
  assert.ok(start >= 0 && end > start);
  const switchSource = background.slice(start, end);
  const detach = switchSource.indexOf('chrome.debugger.detach({ tabId: previousTabId })');
  const revalidate = switchSource.indexOf('isVerifiedGbfTab(candidateTabId)', detach);
  const attach = switchSource.indexOf('chrome.debugger.attach({ tabId: candidateTabId }', revalidate);
  assert.ok(detach >= 0);
  assert.ok(revalidate > detach);
  assert.ok(attach > revalidate);
  assert.match(switchSource, /expectedDetachTabIds\.add\(previousTabId\)/);
});

test('combat lock is keyed by the existing raid instance id and only the same instance can release it', () => {
  assert.match(background, /const parse = await ingestCapturedCombatRecord\(record\)/);
  assert.match(background, /const context = parse \? await getCombatLiveContext\(\) : undefined/);
  assert.match(background, /context\?\.instanceId/);
  assert.match(background, /updateCombatLock\(tabId, context\.instanceId, parse\.result\)/);
  assert.match(background, /combatInstanceId: instanceId/);
  assert.match(background, /current\.combatInstanceId !== instanceId/);
  assert.match(background, /isTerminalResult\(result\)/);
});

test('cross-window lifecycle adds no broader browser or GBF host permission', () => {
  assert.deepEqual([...(manifest.permissions ?? [])].sort(), ['activeTab', 'debugger', 'storage']);
  assert.deepEqual(manifest.host_permissions ?? [], ['https://gbf.wiki/*']);
  assert.doesNotMatch(background, /Network\.replayXHR|Network\.loadNetworkResource|Fetch\.enable|setCacheDisabled/);
});
