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
  assert.match(popup, /launchDashboardWithObservation/);
});

test('popup launch flow adds no GBF request or page instrumentation primitive', () => {
  assert.doesNotMatch(popup, /\bfetch\s*\(/);
  assert.doesNotMatch(popup, /XMLHttpRequest/);
  assert.doesNotMatch(popup, /chrome\.debugger/);
  assert.doesNotMatch(popup, /window\.fetch/);
});
