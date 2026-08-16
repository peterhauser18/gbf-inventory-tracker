import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./global-entity-search-ui.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');

test('global entity search is installed only after the core dashboard first render', () => {
  const render = entry.indexOf('await initialRender');
  const search = entry.indexOf("import('./dashboard/global-entity-search-ui.ts')", render);
  assert.ok(render >= 0);
  assert.ok(search > render);
});

test('palette entity indexing is lazy and local-only', () => {
  assert.match(source, /if \(!query\)/);
  assert.match(source, /import\('\.\.\/account\/storage\.ts'\)/);
  assert.match(source, /import\('\.\/model\.ts'\)/);
  assert.match(source, /loadWikiEntityMetadataCached\(safeLocalStorage\(\), noNetworkMetadataFetch\)/);
  assert.match(source, /Global entity search uses cached public metadata only/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /game\.granbluefantasy\.jp|chrome\.debugger|chrome\.runtime\.sendMessage/);
});

test('entity palette results stay text-only and coexist with core destination results', () => {
  assert.match(source, /class=\"command-result\" data-command-entity/);
  assert.match(source, /Entity · \$\{escapeHtml\(result\.typeLabel\)\}/);
  assert.doesNotMatch(source, /<img|imageUrl|data-command-destination/);
  assert.match(source, /currentRoot\.querySelector\('\.command-empty'\)\?\.remove\(\)/);
});

test('entity selection reuses section/detail controls and expands stash parents inline', () => {
  assert.match(source, /const plan = entityOpenPlan\(result\)/);
  assert.match(source, /button\.dataset\.section === plan\.section/);
  assert.match(source, /navButton\.click\(\)/);
  assert.match(source, /for \(const detailKey of plan\.detailKeys\)/);
  assert.match(source, /button\.dataset\.stashToggle === detailKey/);
  assert.match(source, /stashToggle\.getAttribute\('aria-expanded'\) !== 'true'/);
  assert.match(source, /stashToggle\.click\(\)/);
  assert.match(source, /button\.dataset\.detail === detailKey/);
  assert.match(source, /detailButton\.click\(\)/);
});
