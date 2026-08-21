import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./settings-developer-ui.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./settings-developer-ui.css', import.meta.url), 'utf8');

test('Developer is no longer a top-level Dashboard tab and routes into Settings', () => {
  assert.match(dashboardHtml, /settings-developer-ui\.ts/);
  assert.match(ui, /\.nav-item\[data-section="developer"\][^\n]*\?\.remove\(\)/);
  assert.match(ui, /\[data-command-destination="developer"\]/);
  assert.match(ui, /\.nav-item\[data-section="settings"\][^\n]*\?\.click\(\)/);
  assert.match(ui, /data-settings-developer/);
  assert.doesNotMatch(ui, /innerHTML\s*=\s*app\./);
});

test('Dashboard Settings owns account reset and local storage cleanup controls', () => {
  assert.match(ui, /data-settings-reset-account/);
  assert.match(ui, /data-settings-clear-diagnostic/);
  assert.match(ui, /data-settings-clear-except-account/);
  assert.match(ui, /gbfit:reset-account-data/);
  assert.match(ui, /gbfit:clear-diagnostic-data/);
  assert.match(ui, /gbfit:clear-all-except-account/);
  assert.match(ui, /gbfit:get-status/);
  assert.match(ui, /Stop observation before changing local storage/);
  assert.match(ui, /This does not change your GBF account/);
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|chrome\.debugger/);
});

test('visible Data confidence legend is removed everywhere in Dashboard UI', () => {
  assert.match(dashboardHtml, /settings-developer-ui\.css/);
  assert.match(css, /\.quality-legend\s*\{[^}]*display:\s*none !important/s);
});

test('opening Settings does not restore the old narrow top-navigation layout', () => {
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*html body \.dashboard-shell\s*\{[^}]*display:\s*grid !important/s);
  assert.match(css, /dashboard-sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\) !important/s);
  assert.match(css, /html body \.dashboard-shell \.nav\s*\{[^}]*display:\s*grid !important/s);
});
