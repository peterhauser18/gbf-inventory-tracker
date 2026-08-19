import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const raidsCss = readFileSync(new URL('./raids-v2.css', import.meta.url), 'utf8');
const combatCss = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

test('combat exposes exactly five named presets with Cypher Modern as fallback', () => {
  const presetEntries = [...layouts.matchAll(/\['(cypher-modern|combat-cockpit|party-first|analyzer-split|compact-live)',\s*'([^']+)'\]/g)];
  assert.deepEqual(presetEntries.map((entry) => [entry[1], entry[2]]), [
    ['cypher-modern', 'Cypher Modern'],
    ['combat-cockpit', 'Combat Cockpit'],
    ['party-first', 'Party First'],
    ['analyzer-split', 'Analyzer Split'],
    ['compact-live', 'Compact Live'],
  ]);
  assert.match(layouts, /const view = buildView\(input\);/);
  assert.match(layouts, /default: return renderCypherModern\(view\);/);
  assert.doesNotMatch(layouts, /qualityChip|class=\\?"quality/);
});

test('all visual presets consume the same shared view instead of duplicating calculations', () => {
  for (const renderer of ['renderCypherModern', 'renderCockpit', 'renderPartyFirst', 'renderAnalyzerSplit', 'renderCompactLive']) {
    assert.match(layouts, new RegExp(`function ${renderer}\\(view: CombatView\\)`));
  }
  assert.equal((layouts.match(/buildCharacterAnalyses\(input\.raid\)/g) ?? []).length, 1);
  assert.equal((layouts.match(/summarizeTurns\(input\.raid, context\?\.turn\)/g) ?? []).length, 1);
  assert.match(layouts, /data-character-select/);
  assert.match(layouts, /data-combat-image/);
  assert.match(layouts, /Party summons/);
});

test('combat layouts hide unsupported Supplemental damage from both drilldown and cockpit views', () => {
  assert.match(combatCss, /\.analysis-breakdown > :nth-child\(5\)\s*\{[^}]*display:\s*none/s);
  assert.match(combatCss, /\.cockpit-row > :nth-child\(7\)\s*\{[^}]*display:\s*none/s);
});

test('raid search shell is not replaced on each input or one-second refresh', () => {
  const inputHandler = /combat-raid-search[\s\S]*?addEventListener\('input',[\s\S]*?\n  \}\);/.exec(ui)?.[0] ?? '';
  const intervalHandler = /window\.setInterval\(\(\) => \{[\s\S]*?\n  \}, 1000\);/.exec(ui)?.[0] ?? '';
  const unchangedMarkupGuard = /if \(!force && markup === lastSectionMarkup\) \{([\s\S]*?)\n  \}/.exec(ui)?.[1] ?? '';
  assert.match(inputHandler, /renderSectionIfChanged\(\)/);
  assert.doesNotMatch(inputHandler, /renderSelectedShell\(/);
  assert.match(unchangedMarkupGuard, /return;/);
  assert.doesNotMatch(unchangedMarkupGuard, /section\.innerHTML/);
  assert.match(intervalHandler, /controller\.refresh\(\)/);
  assert.match(intervalHandler, /refreshCombatLiveUiState\(\)/);
  assert.match(intervalHandler, /\.then\(\(\) => renderSectionIfChanged\(\)\)/);
  assert.doesNotMatch(intervalHandler, /renderSelectedShell\(/);
});

test('raid drops use a five-column aligned grid and global pin area', () => {
  assert.match(raidsCss, /\.raid-drop-grid \{[^}]*grid-template-columns:\s*minmax\(200px, 1\.5fr\) 70px 120px 95px 100px;/s);
  assert.match(raidsCss, /\.global-pins/);
  assert.match(raidsCss, /\.global-pin-grid/);
});
