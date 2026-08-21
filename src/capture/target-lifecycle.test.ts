import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
) as { permissions?: string[]; host_permissions?: string[] };

test('observation keeps activated verified GBF tabs attached across focused Edge windows without attach-all discovery', () => {
  assert.match(background, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(background, /chrome\.windows\.onFocusChanged\.addListener/);
  assert.match(background, /chrome\.tabs\.query\(\{ active: true, windowId \}\)/);
  assert.match(background, /chrome\.debugger\.getTargets\(\)/);
  assert.match(background, /tabIds\?: number\[\]/);
  assert.match(background, /tabIds: \[target\.tabId\]/);
  assert.doesNotMatch(background, /chrome\.tabs\.query\(\{[^}]*url:/);
});

test('cross-window target activation adds the verified GBF tab without detaching existing observation targets', () => {
  const start = background.indexOf('async function switchObservationTarget');
  const end = background.indexOf('async function enableNetworkObservation', start);
  assert.ok(start >= 0 && end > start);
  const switchSource = background.slice(start, end);
  const revalidate = switchSource.indexOf('isVerifiedGbfTab(candidateTabId)');
  const attach = switchSource.indexOf('chrome.debugger.attach({ tabId: candidateTabId }', revalidate);
  const append = switchSource.indexOf('...observationTabIds(current), candidateTabId', attach);
  assert.ok(revalidate >= 0);
  assert.ok(attach > revalidate);
  assert.ok(append > attach);
  assert.doesNotMatch(switchSource, /chrome\.debugger\.detach\(\{ tabId: previousTabId \}\)/);
  assert.doesNotMatch(switchSource, /clearCombatParseContext\(\)/);
});

test('parallel tab network bookkeeping is target-scoped and accepts every attached observed GBF tab', () => {
  assert.match(background, /const pendingResponses = new Map<number, CaptureEventBuffer>\(\)/);
  assert.match(background, /scopedRequestId\(tabId, requestId\)/);
  assert.match(background, /observationIncludesTab\(state, tabId\)/);
  assert.match(background, /pendingResponseBuffer\(tabId\)\.remember/);
  assert.match(background, /pendingResponseBuffer\(tabId\)\.take/);
  assert.match(background, /clearPendingObservationData\(tabId\)/);
});

test('stop, retarget, tab removal and debugger detach share one serialized target lifecycle', () => {
  assert.match(background, /function stopObservation\(\): Promise<CaptureStatusResponse> \{\s*return withTargetQueue\(stopObservationNow\);\s*\}/s);
  assert.match(background, /function queueObservationRetarget[\s\S]*withTargetQueue\(\(\) => retargetObservation\(candidateTabId\)\)/);
  assert.match(background, /chrome\.debugger\.onDetach\.addListener[\s\S]*withTargetQueue\(\(\) => handleUnexpectedDetach/);
  assert.match(background, /chrome\.tabs\.onRemoved\.addListener[\s\S]*withTargetQueue\(\(\) => releaseUnavailableTarget/);
  assert.match(background, /function withTargetQueue<T>[\s\S]*targetQueue\.catch\(\(\) => \{\}\)\.then\(operation\)[\s\S]*targetQueue = run\.then/);
});

test('stopping observation marks the scan inactive before detaching every retained GBF target', () => {
  const start = background.indexOf('async function stopObservationNow');
  const end = background.indexOf('function queueObservationRetarget', start);
  assert.ok(start >= 0 && end > start);
  const stopSource = background.slice(start, end);
  const markInactive = stopSource.indexOf('setRuntimeState({ active: false');
  const detachLoop = stopSource.indexOf('for (const tabId of tabIds)');
  assert.ok(markInactive >= 0);
  assert.ok(detachLoop > markInactive);
  assert.match(stopSource, /const tabIds = observationTabIds\(state\)/);
  assert.match(stopSource, /chrome\.debugger\.detach\(\{ tabId \}\)/);
});

test('combat routing remembers a proven raid instance per GBF tab and fails closed before that tab is mapped', () => {
  assert.match(background, /combatInstances\?: Record<string, string>/);
  assert.match(background, /ingestCapturedCombatRecord\(record, combatInstanceForTab\(state, tabId\) \?\? null\)/);
  assert.match(background, /if \(parse\?\.instanceId\)/);
  assert.match(background, /updateCombatLock\(tabId, parse\.instanceId, parse\.result\)/);
  assert.match(background, /combatInstances\[key\] = instanceId/);
  assert.match(background, /delete combatInstances\[key\]/);
});

test('moving a known fight tab preserves its raid instance and can reattach that specific tab', () => {
  assert.match(background, /chrome\.tabs\.onAttached\.addListener\(\(tabId\) => \{\s*void recoverMovedCombatTarget\(tabId\);\s*\}\)/s);
  assert.match(background, /async function recoverMovedCombatTarget[\s\S]*observationIncludesTab\(state, tabId\)[\s\S]*!combatInstanceForTab\(state, tabId\)[\s\S]*queueObservationRetarget\(tabId\)/);
  const start = background.indexOf('async function handleUnexpectedDetach');
  const end = background.indexOf('function clearPendingObservationData', start);
  assert.ok(start >= 0 && end > start);
  const detachSource = background.slice(start, end);
  assert.match(detachSource, /if \(reason === 'canceled_by_user'\)[\s\S]*clearCombatParseContext\(\)/);
  assert.match(detachSource, /remainingTabIds[\s\S]*chrome\.debugger\.detach\(\{ tabId: remainingTabId \}\)/);
  assert.match(detachSource, /combatInstanceForTab\(state, tabId\)[\s\S]*queueObservationRetarget\(tabId\)/);
});

test('cross-window lifecycle adds no broader browser or GBF host permission and emits no gameplay requests', () => {
  assert.deepEqual([...(manifest.permissions ?? [])].sort(), ['activeTab', 'debugger', 'storage']);
  assert.deepEqual(manifest.host_permissions ?? [], ['https://gbf.wiki/*']);
  assert.doesNotMatch(background, /Network\.replayXHR|Network\.loadNetworkResource|Fetch\.enable|setCacheDisabled/);
});
