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
  const targetless = switchSource.indexOf('setRuntimeState({ active: true, scanId: state.scanId })');
  const detach = switchSource.indexOf('chrome.debugger.detach({ tabId: previousTabId })');
  const revalidate = switchSource.indexOf('isVerifiedGbfTab(candidateTabId)', detach);
  const attach = switchSource.indexOf('chrome.debugger.attach({ tabId: candidateTabId }', revalidate);
  assert.ok(targetless >= 0);
  assert.ok(detach > targetless);
  assert.ok(revalidate > detach);
  assert.ok(attach > revalidate);
  assert.match(switchSource, /if \(candidateAttached\)[\s\S]*chrome\.debugger\.detach\(\{ tabId: candidateTabId \}\)/);
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

test('moving a locked fight tab preserves its raid instance and reattaches the same tab', () => {
  assert.match(background, /chrome\.tabs\.onAttached\.addListener\(\(tabId\) => \{\s*void recoverMovedCombatTarget\(tabId\);\s*\}\)/s);
  const start = background.indexOf('async function handleUnexpectedDetach');
  const end = background.indexOf('function normalizeResourceType', start);
  assert.ok(start >= 0 && end > start);
  const detachSource = background.slice(start, end);
  assert.match(detachSource, /if \(reason === 'canceled_by_user'\) \{\s*await clearCombatParseContext\(\)/s);
  assert.doesNotMatch(detachSource.replace(/if \(reason === 'canceled_by_user'\)[\s\S]*?return;\s*\}/, ''), /clearCombatParseContext\(\)/);
  assert.match(detachSource, /delete next\.tabId/);
  assert.match(detachSource, /state\.combatTabId === tabId && state\.combatInstanceId/);
  assert.match(detachSource, /queueObservationRetarget\(tabId\)/);
});

test('cross-window lifecycle adds no broader browser or GBF host permission', () => {
  assert.deepEqual([...(manifest.permissions ?? [])].sort(), ['activeTab', 'debugger', 'storage']);
  assert.deepEqual(manifest.host_permissions ?? [], ['https://gbf.wiki/*']);
  assert.doesNotMatch(background, /Network\.replayXHR|Network\.loadNetworkResource|Fetch\.enable|setCacheDisabled/);
});
