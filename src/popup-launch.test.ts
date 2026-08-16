import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('./popup.ts', import.meta.url), 'utf8');

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

test('diagnostic capture storage is not imported during popup startup', () => {
  assert.doesNotMatch(popup, /import \{ getCapturedResponsesForScan \} from '\.\/capture\/storage\.ts'/);
  assert.match(popup, /await import\('\.\/capture\/storage\.ts'\)/);
});
