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

test('stored theme CSS and preference are applied by core boot without loading the toggle controller', () => {
  assert.match(entry, /import '\.\/dashboard\/theme\.css'/);
  assert.match(entry, /applyStoredTheme\(\)/);
  assert.match(entry, /parseDashboardTheme\(localStorage\.getItem\(DASHBOARD_THEME_STORAGE_KEY\)\)/);
  assert.match(entry, /document\.documentElement\.dataset\.theme = theme/);
});

test('Goals and Farming load only on the Goals click path and in sequence', () => {
  const goalsStart = entry.indexOf("if (nav && section === 'goals')");
  const goalsEnd = entry.indexOf("if (nav && (section === 'combat'", goalsStart);
  assert.ok(goalsStart >= 0 && goalsEnd > goalsStart);
  const goalsSource = entry.slice(goalsStart, goalsEnd);
  const goalsImport = goalsSource.indexOf("import('./dashboard/goals-ui.ts')");
  const farmingImport = goalsSource.indexOf("import('./dashboard/farming-ui.ts')");
  assert.ok(goalsImport >= 0);
  assert.ok(farmingImport > goalsImport);
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

test('hidden dashboard defers account reload and flushes relevant dirty evidence when visible again', () => {
  assert.match(entry, /document\.visibilityState === 'visible'/);
  assert.match(entry, /document\.addEventListener\('visibilitychange'/);
  assert.match(entry, /window\.addEventListener\('focus', flushDirtyEvidence\)/);
  assert.match(entry, /function flushDirtyEvidence\(\)/);
  assert.doesNotMatch(entry, /if \(!section \|\| sectionUsesAccountEvidence/);
});

test('zero-state dashboard reloads when the first valid account snapshot is persisted', () => {
  assert.match(entry, /ACCOUNT_DATABASE_VERSION/);
  assert.match(entry, /let firstAccountSnapshotPending = false/);
  assert.match(entry, /!hasStoredAccountSnapshot\(change\.oldValue\) && hasStoredAccountSnapshot\(change\.newValue\)/);
  assert.match(entry, /if \(firstSnapshotAvailable && !activeSection\(\)\)/);
  assert.match(entry, /if \(firstAccountSnapshotPending && !activeSection\(\)\)/);
  assert.match(entry, /function scheduleFirstSnapshotReload\(\)/);
  assert.match(entry, /scheduleReload\(undefined, 0\)/);
});

test('obsolete Dashboard Developer observation card is removed from the rendered local UI', () => {
  assert.match(entry, /heading\.textContent === 'Observation control'/);
  assert.match(entry, /heading\.closest<HTMLElement>\('\.system-card'\)\?\.remove\(\)/);
});

test('extension builds do not emit modulepreload links for Edge extension pages', () => {
  assert.match(vite, /modulePreload:\s*false/);
});
