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

test('cross-window retarget preserves combat contexts while attaching only the focused verified GBF tab', () => {
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
  assert.doesNotMatch(switchSource, /clearCombatParseContext\(\)/);
  assert.match(switchSource, /const preservedState: RuntimeState = \{ \.\.\.state, active: true, scanId: state\.scanId \}/);
  assert.match(switchSource, /if \(candidateAttached\)[\s\S]*chrome\.debugger\.detach\(\{ tabId: candidateTabId \}\)/);
});

test('combat routing remembers a proven raid instance per GBF tab and fails closed before that tab is mapped', () => {
  assert.match(background, /combatInstances\?: Record<string, string>/);
  assert.match(background, /ingestCapturedCombatRecord\(record, combatInstanceForTab\(state, tabId\) \?\? null\)/);
  assert.match(background, /if \(parse\?\.instanceId\)/);
  assert.match(background, /updateCombatLock\(tabId, parse\.instanceId, parse\.result\)/);
  assert.match(background, /combatInstances\[key\] = instanceId/);
  assert.match(background, /delete combatInstances\[key\]/);
});

test('moving a known fight tab preserves its raid instance and reattaches the same tab', () => {
  assert.match(background, /chrome\.tabs\.onAttached\.addListener\(\(tabId\) => \{\s*void recoverMovedCombatTarget\(tabId\);\s*\}\)/s);
  assert.match(background, /async function recoverMovedCombatTarget[\s\S]*!combatInstanceForTab\(state, tabId\)[\s\S]*queueObservationRetarget\(tabId\)/);
  const start = background.indexOf('async function handleUnexpectedDetach');
  const end = background.indexOf('function normalizeResourceType', start);
  assert.ok(start >= 0 && end > start);
  const detachSource = background.slice(start, end);
  assert.match(detachSource, /if \(reason === 'canceled_by_user'\) \{\s*await clearCombatParseContext\(\)/s);
  assert.match(detachSource, /combatInstanceForTab\(state, tabId\)[\s\S]*queueObservationRetarget\(tabId\)/);
});

test('cross-window lifecycle adds no broader browser or GBF host permission', () => {
  assert.deepEqual([...(manifest.permissions ?? [])].sort(), ['activeTab', 'debugger', 'storage']);
  assert.deepEqual(manifest.host_permissions ?? [], ['https://gbf.wiki/*']);
  assert.doesNotMatch(background, /Network\.replayXHR|Network\.loadNetworkResource|Fetch\.enable|setCacheDisabled/);
});
