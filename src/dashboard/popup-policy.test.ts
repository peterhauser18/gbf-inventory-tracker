import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('../popup.ts', import.meta.url), 'utf8');

test('popup keeps Dashboard as the normal action and developer controls collapsed together', () => {
  const dashboard = popup.indexOf('id="dashboard"');
  const developer = popup.indexOf('<details class="developer">');
  const status = popup.indexOf('id="status"', developer);
  const reset = popup.indexOf('id="reset-account"', developer);
  const exportButton = popup.indexOf('id="export"', developer);
  const cleanup = popup.indexOf('id="clear-diagnostic"', developer);

  assert.ok(dashboard >= 0 && dashboard < developer);
  assert.ok(developer > dashboard);
  assert.ok(status > developer);
  assert.ok(reset > developer);
  assert.ok(exportButton > developer);
  assert.ok(cleanup > developer);
  assert.match(popup, /openDashboardTab/);
});

test('Dashboard open does not wait for observation completion and observation targets the exact selected tab id', () => {
  assert.match(popup, /findActiveTabId/);
  assert.match(popup, /chrome\.tabs\.query\(\{ active: true, lastFocusedWindow: true \}\)/);
  assert.match(popup, /const observationPromise = tabId !== undefined/);
  assert.match(popup, /sendMessage\(\{ type: 'gbfit:start-observation', tabId \}\)/);
  assert.match(popup, /await openDashboardTab\(\)/);
  assert.match(popup, /await observationPromise/);
  assert.ok(popup.indexOf('await openDashboardTab()') < popup.indexOf('await observationPromise'));
  assert.match(popup, /Dashboard opened without observation/);
  assert.doesNotMatch(popup, /isGbfPageUrl/);
});

test('manual Developer observation passes the exact selected tab for background GBF validation', () => {
  assert.match(popup, /requireActiveTabId/);
  assert.match(popup, /sendMessage\(\{ type: 'gbfit:start-observation', tabId: await requireActiveTabId\(\) \}\)/);
  assert.match(popup, /if \(response\.error\) trackingNote\.textContent = response\.error/);
});

test('popup launch flow adds no GBF request or page instrumentation primitive', () => {
  assert.doesNotMatch(popup, /\bfetch\s*\(/);
  assert.doesNotMatch(popup, /XMLHttpRequest/);
  assert.doesNotMatch(popup, /chrome\.debugger/);
  assert.doesNotMatch(popup, /window\.fetch/);
});
