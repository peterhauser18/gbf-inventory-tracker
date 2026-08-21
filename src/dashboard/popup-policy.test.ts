import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('../popup.ts', import.meta.url), 'utf8');
const popupCleanup = readFileSync(new URL('../popup-cleanup.ts', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../../popup.html', import.meta.url), 'utf8');

test('popup keeps Dashboard as the normal action and only manual observation under Developer', () => {
  const dashboard = popup.indexOf('id="dashboard"');
  const developer = popup.indexOf('<details class="developer">');
  const status = popup.indexOf('id="status"', developer);
  const reset = popup.indexOf('id="reset-account"', developer);

  assert.ok(dashboard >= 0 && dashboard < developer);
  assert.ok(developer > dashboard);
  assert.ok(status > developer);
  assert.ok(reset > developer, 'legacy popup source still defines reset before cleanup removes it');
  assert.match(popup, /openDashboardTab/);

  assert.match(popupHtml, /src="\/src\/popup-cleanup\.ts"/);
  assert.doesNotMatch(popupHtml, /src="\/src\/popup\.ts"/);
  assert.match(popupCleanup, /import '\.\/popup\.ts'/);
  assert.match(popupCleanup, /removeCardFor\('#response-count'\)/);
  assert.match(popupCleanup, /removeCardFor\('#clear-diagnostic'\)/);
  assert.match(popupCleanup, /removeElement\('#reset-account'\)/);
  assert.match(popupCleanup, /account reset and local-storage cleanup are in Dashboard Settings/);
});

test('Dashboard always opens while observation only targets an explicitly active GBF tab', () => {
  assert.match(popup, /findActiveGbfTabId/);
  assert.match(popup, /const observationPromise = tabId !== undefined/);
  assert.match(popup, /sendMessage\(\{ type: 'gbfit:start-observation', tabId \}\)/);
  assert.match(popup, /: sendMessage\(\{ type: 'gbfit:get-status' \}\)/);
  assert.match(popup, /await openDashboardTab\(\)/);
  assert.match(popup, /const observationStatus = await observationPromise/);
  assert.match(popup, /Dashboard opened without observation/);
});

test('manual Developer observation still requires the explicitly selected GBF tab', () => {
  assert.match(popup, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
  assert.match(popup, /isGbfPageUrl\(tab\.url\)/);
  assert.match(popup, /requireActiveGbfTabId/);
  assert.match(popup, /sendMessage\(\{ type: 'gbfit:start-observation', tabId: await requireActiveGbfTabId\(\) \}\)/);
});

test('popup launch flow adds no GBF request or page instrumentation primitive', () => {
  const source = `${popup}\n${popupCleanup}`;
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /window\.fetch/);
});
