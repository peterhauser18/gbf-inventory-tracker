import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../dashboard.ts', import.meta.url), 'utf8');
const dashboardEntry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');
const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
const goalsUi = readFileSync(new URL('./goals-ui.ts', import.meta.url), 'utf8');
const goals = readFileSync(new URL('./goals.ts', import.meta.url), 'utf8');
const roster = readFileSync(new URL('./roster-ui.ts', import.meta.url), 'utf8');
const phase5 = readFileSync(new URL('./phase5-ui.ts', import.meta.url), 'utf8');
const collection = readFileSync(new URL('./collection-tracker-ui.ts', import.meta.url), 'utf8');
const farming = readFileSync(new URL('./farming-ui.ts', import.meta.url), 'utf8');
const emptyState = readFileSync(new URL('./empty-state.ts', import.meta.url), 'utf8');
const combatDashboard = readFileSync(new URL('../combat/dashboard-v2.ts', import.meta.url), 'utf8');
const combatLayouts = readFileSync(new URL('../combat/layouts.ts', import.meta.url), 'utf8');
const combatCompare = readFileSync(new URL('../combat/combat-compare-ui.ts', import.meta.url), 'utf8');

test('complete quality states do not render redundant badges', () => {
  for (const source of [dashboard, goalsUi, roster, combatCompare]) {
    assert.match(source, /if \(quality === 'known'\) return '';/);
    assert.match(source, /quality === 'partial' \? 'Incomplete' : 'Unavailable'/);
  }
});

test('dashboard display copy keeps uncertainty without raw quality labels', () => {
  assert.doesNotMatch(dashboard, /state unknown|stay unknown|stays unknown|unknown time/);
  assert.doesNotMatch(model, /value: 'unknown'|Details partial \/ unknown|subtitle: `\$\{formatNumber\(stash\.weapons\.length\)\} observed weapons · \$\{stash\.quality\}`/);
  assert.match(model, /function qualityDisplay\(quality: DataQuality\): string/);
  assert.match(dashboard, /evidence\.state === 'unknown' \? '\?' : evidence\.satisfied \? 'yes' : 'no'/);
  assert.match(dashboard, /material\.state === 'known' \? escapeHtml\(formatNumber\(material\.owned \?\? 0\)\) : '\?'/);
  assert.match(dashboardEntry, /value !== 'unknown' && value !== 'unavailable'/);
  assert.doesNotMatch(emptyState, /Unknown evidence/);
});

test('goals use user-facing uncertainty wording while keeping question-mark material values', () => {
  assert.doesNotMatch(goalsUi, /Known deficits|Unknown materials|\$\{unknown\} unknown/);
  assert.match(goalsUi, /<span>Missing <strong>\$\{knownMissing\}<\/strong><\/span>/);
  assert.match(goalsUi, /<span>Needs data <strong>\$\{unknown\}<\/strong><\/span>/);
  assert.match(goalsUi, /Have \? · Required \$\{formatNumber\(material\.required\)\} · Missing \?/);
  assert.doesNotMatch(goals, /current step is known and satisfied/);
  assert.match(goals, /current step is available and satisfied/);
});

test('roster hides complete quality metadata and warns only when evidence is incomplete', () => {
  assert.doesNotMatch(roster, /Roster family coverage:|unknown capability cells|escapeHtml\(row\.metadataQuality\)/);
  assert.match(roster, /base === 'known' \? '' : `<span>Wiki metadata<\/span>\$\{qualityChip\(base\)\}`/);
  assert.match(roster, /quality === 'partial' \? ' · metadata incomplete' : ' · metadata unavailable'/);
  assert.match(roster, /unresolved capability cells are not treated as matches/);
  assert.match(roster, />\?<\/span>`;/);
});

test('settings, collection and farming surfaces avoid raw quality-state wording', () => {
  assert.match(phase5, /legendItem\('known', 'Complete'/);
  assert.match(phase5, /legendItem\('partial', 'Incomplete'/);
  assert.match(phase5, /legendItem\('unknown', 'Unavailable'/);
  assert.doesNotMatch(phase5, />\$\{quality\}<|`\$\{row\.quality\}`|known summary values|unknown time/);
  assert.doesNotMatch(collection, /Roster coverage is \$\{rosterQuality\}|Roster coverage is known|Partial export|uncap state is unknown/);
  assert.match(collection, /Incomplete export/);
  assert.doesNotMatch(farming, /Unknown inventory|ownership is known|more known material deficit|Wiki source unknown/);
  assert.match(farming, /Wiki source not modeled/);
});

test('combat surfaces keep uncertainty without raw partial or unknown labels', () => {
  assert.doesNotMatch(combatDashboard, /Unknown actor|unavailable or partial/);
  assert.doesNotMatch(combatLayouts, /\(partial\)|Unknown actor/);
  assert.match(combatLayouts, /Actor unavailable/);
  assert.match(combatLayouts, /\(estimated\)/);
  assert.doesNotMatch(combatCompare, />\$\{comparison\.damageQuality\}<|partial\/unknown/);
  assert.match(combatCompare, /qualityChip\(comparison\.damageQuality\)/);
  assert.match(combatCompare, /quality === 'partial' \? `≥ \$\{formatted\}` : formatted/);
  assert.match(combatCompare, /quality === 'partial' \? `≈ \$\{formatted\}` : formatted/);
});
