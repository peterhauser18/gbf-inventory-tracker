import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

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

test('core render does not immediately fan out into every dashboard enhancement', () => {
  assert.match(entry, /const initialRender = waitForInitialDashboardRender\(app\)/);
  assert.match(entry, /await import\('\.\/dashboard\.ts'\)/);
  assert.match(entry, /await initialRender/);
  assert.doesNotMatch(entry, /loadDashboardEnhancements/);
  assert.doesNotMatch(entry, /void Promise\.allSettled/);
});

test('Goals loads its own owner without starting Farming in the same click path', () => {
  assert.match(entry, /section === 'goals'/);
  assert.match(entry, /import\('\.\/dashboard\/goals-ui\.ts'\)/);
  assert.doesNotMatch(entry, /farming-ui\.ts/);
});

test('external dashboard destinations load their owner before replaying the click', () => {
  assert.match(entry, /section === 'combat' \|\| section === 'raids'/);
  assert.match(entry, /section === 'roster'/);
  assert.match(entry, /interceptUntilLoaded/);
  assert.match(entry, /ensureEnhancement\(key, load\)\.then\(\(\) => element\.click\(\)\)/);
});

test('core-owned destinations load only their optional enhancement on demand', () => {
  assert.match(entry, /section === 'characters'/);
  assert.match(entry, /collection-tracker-ui\.ts/);
  assert.match(entry, /section === 'eternals' \|\| section === 'evokers'/);
  assert.match(entry, /goals-ui\.ts/);
  assert.match(entry, /section === 'settings'/);
  assert.match(entry, /theme-toggle\.ts/);
  assert.match(entry, /phase5-ui\.ts/);
});

test('account writes cannot reload the page before an active dashboard section exists', () => {
  assert.match(entry, /if \(section && sectionUsesAccountEvidence\(section, changed\)\) scheduleReload\(section, 500\)/);
  assert.doesNotMatch(entry, /if \(!section \|\| sectionUsesAccountEvidence/);
});

test('extension builds do not emit modulepreload links for Edge extension pages', () => {
  assert.match(vite, /modulePreload:\s*false/);
});
