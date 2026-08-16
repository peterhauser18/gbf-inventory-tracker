import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');

const enhancementModules = [
  'roster-ui.ts',
  'collection-tracker-ui.ts',
  'theme-toggle.ts',
  'goals-ui.ts',
  'farming-ui.ts',
  'combat/ui.ts',
  'combat-compare-ui.ts',
  'phase5-ui.ts',
];

test('dashboard HTML boots only the core entry module', () => {
  assert.match(html, /src="\/src\/dashboard-entry\.ts"/);
  for (const moduleName of enhancementModules) {
    assert.doesNotMatch(html, new RegExp(`src=["'][^"']*${moduleName.replace('.', '\\.')}`));
  }
});

test('enhancements load only after the first core dashboard render', () => {
  assert.match(entry, /const initialRender = waitForInitialDashboardRender\(app\)/);
  assert.match(entry, /await import\('\.\/dashboard\.ts'\)/);
  assert.match(entry, /await initialRender/);
  assert.match(entry, /void loadDashboardEnhancements\(\)/);
  assert.match(entry, /Promise\.allSettled/);
});

test('account writes cannot reload the page before an active dashboard section exists', () => {
  assert.match(entry, /if \(section && sectionUsesAccountEvidence\(section, changed\)\) scheduleReload\(section, 500\)/);
  assert.doesNotMatch(entry, /if \(!section \|\| sectionUsesAccountEvidence/);
});
