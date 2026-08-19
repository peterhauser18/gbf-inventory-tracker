import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard-v2.ts', import.meta.url), 'utf8');
const historyLayout = readFileSync(new URL('./raid-history-layout-ui.ts', import.meta.url), 'utf8');
const presentationFixes = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');

test('Raid History exposes the same Combat layout selector and passes the selected preset to history rendering', () => {
  assert.match(ui, /const layoutControl = .*COMBAT_LAYOUT_PRESETS/s);
  assert.match(ui, /selected === 'combat'[\s\S]*?layoutControl[\s\S]*?combat-raid-search[\s\S]*?\$\{layoutControl\}/);
  assert.match(ui, /controller\.renderRaids\(query, layout\)/);
});

test('Raid History renders each saved raid through the shared Combat renderer instead of the legacy combat table', () => {
  assert.match(dashboard, /renderHistoricalRaidLayout\(/);
  assert.match(historyLayout, /renderCombatLayout\(layout,/);
  assert.doesNotMatch(dashboard, /private renderRaidCombat\(/);
  assert.doesNotMatch(historyLayout, /getCombatLiveContext|getLatestCombatParse|getActiveCombatRaids/);
});

test('historical party, summons, and interaction state are scoped to the selected history record', () => {
  assert.match(historyLayout, /const loadout = raid\.loadout/);
  assert.match(historyLayout, /members = \[\.\.\.loadout\.party\]/);
  assert.match(historyLayout, /summons: loadout\.summons\.map/);
  assert.match(historyLayout, /data-support-summon/);
  assert.match(dashboard, /selectedRaidActorByLocalId/);
  assert.match(dashboard, /collapsedRaidLayoutSections/);
  assert.match(dashboard, /data-history-layout-owner/);
});

test('shared presentation fixes disambiguate Ougi uses and hide technical MC resource labels', () => {
  assert.match(presentationFixes, /label\.textContent = 'Ougi uses'/);
  assert.match(presentationFixes, /label\.textContent = 'Main Character'/);
  assert.match(presentationFixes, /\(\?:\^\|_\)sp/);
  assert.match(ui, /applySharedCombatPresentationFixes\(section\)/);
});
