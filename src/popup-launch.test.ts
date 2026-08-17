import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('./popup.ts', import.meta.url), 'utf8');
const popupCombat = readFileSync(new URL('./popup-combat.ts', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../popup.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8')) as {
  name?: string;
  action?: { default_title?: string };
};

test('dashboard opening never waits for observation startup', () => {
  const observationStart = popup.indexOf('const observationPromise');
  const dashboardOpen = popup.indexOf('await openDashboardTab()');
  const observationAwait = popup.indexOf('const observationStatus = await observationPromise');

  assert.ok(observationStart >= 0, 'observation starts in parallel');
  assert.ok(dashboardOpen > observationStart, 'dashboard opens after observation is kicked off');
  assert.ok(observationAwait > dashboardOpen, 'observation is awaited only after dashboard open');
});

test('automatic observation still targets only an explicitly selected GBF tab', () => {
  assert.match(popup, /findActiveGbfTabId\(\)/);
  assert.match(popup, /isGbfPageUrl\(tab\.url\)/);
  assert.match(popup, /sendMessage\(\{ type: 'gbfit:start-observation', tabId \}\)/);
});

test('popup exposes a standalone Combat Tracker launcher without opening the dashboard', () => {
  assert.match(popupHtml, /src="\/src\/popup-combat\.ts"/);
  assert.match(popupCombat, /Open Combat Tracker/);
  assert.match(popupCombat, /chrome\.runtime\.getURL\('combat\.html'\)/);
  assert.doesNotMatch(popupCombat, /dashboard\.html/);
});

test('Combat Tracker launcher reuses the existing explicit GBF-tab observation boundary', () => {
  assert.match(popupCombat, /isGbfPageUrl\(tab\.url\)/);
  assert.match(popupCombat, /type: 'gbfit:start-observation', tabId: tab\.id/);
  assert.doesNotMatch(popupCombat, /fetch\(|XMLHttpRequest|webRequest/);
});

test('diagnostic capture storage is not imported during popup startup', () => {
  assert.doesNotMatch(popup, /import \{ getCapturedResponsesForScan \} from '\.\/capture\/storage\.ts'/);
  assert.match(popup, /await import\('\.\/capture\/storage\.ts'\)/);
});

test('clean installs expose the GBF Tracker user-facing name without renaming the internal message namespace', () => {
  assert.equal(manifest.name, 'GBF Tracker');
  assert.equal(manifest.action?.default_title, 'GBF Tracker');
  assert.match(popupHtml, /<title>GBF Tracker<\/title>/);
  assert.match(popup, /<h1>GBF Tracker<\/h1>/);
  assert.match(popup, /gbfit:/, 'internal message namespace remains unchanged');
});
