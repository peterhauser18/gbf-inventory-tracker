import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popup = readFileSync(new URL('../popup.ts', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

test('Dashboard open is started after tab capture but before observation completion is awaited', () => {
  const captureTab = popup.indexOf('tabId = await findActiveTabId()');
  const observationStart = popup.indexOf("const observationPromise = tabId !== undefined");
  const dashboardOpen = popup.indexOf('await openDashboardTab()');
  const observationAwait = popup.indexOf('await observationPromise');

  assert.ok(captureTab >= 0);
  assert.ok(observationStart > captureTab);
  assert.ok(dashboardOpen > observationStart);
  assert.ok(observationAwait > dashboardOpen);
});

test('popup does not eagerly load diagnostic IndexedDB storage', () => {
  assert.doesNotMatch(popup, /^import .*capture\/storage\.ts/m);
  assert.match(popup, /await import\('\.\/capture\/storage\.ts'\)/);
});

test('extension build disables modulepreload for Edge extension pages', () => {
  assert.match(vite, /modulePreload:\s*false/);
});
