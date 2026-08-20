import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard-v2.ts', import.meta.url), 'utf8');
const historyLayout = readFileSync(new URL('./raid-history-layout-ui.ts', import.meta.url), 'utf8');
const presentationFixes = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');

test('Raid History uses the fixed Combat Cockpit preset without exposing a layout selector', () => {
  assert.match(ui, /const layout: CombatLayoutPreset = 'combat-cockpit'/);
  assert.doesNotMatch(ui, /const layoutControl = .*COMBAT_LAYOUT_PRESETS/s);
  assert.doesNotMatch(ui, /combat-layout-select|COMBAT_LAYOUT_PRESETS\.map/);
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

test('historical summon cards stay limited to persisted loadout entries and can fall back to master-id images', () => {
  assert.match(historyLayout, /const summon = loadout\.summons\[index\+\+\]/);
  assert.match(historyLayout, /if \(!summon\) return '';/);
  assert.match(historyLayout, /historicalSummonImageUrl\(summon\.id\)/);
  assert.match(historyLayout, /\^20\\d\{8\}\$/);
  assert.match(historyLayout, /wikiEntityImageUrl\('summon', id\)/);
});

test('historical MC identity prefers proven display text but rejects technical resource labels', () => {
  assert.match(historyLayout, /isTechnicalMainCharacterLabel\(mainAnalysis\.actorId\)/);
  assert.match(historyLayout, /humanFacingPlayerName\(mainAnalysis\.actorName\)/);
  assert.match(historyLayout, /const accountDisplayName = persistedMainName \?\? observedMainName/);
});

test('shared presentation fixes compact Ougi and attack-mode metrics and hide technical MC resource labels', () => {
  assert.match(presentationFixes, /ougiLabel\.textContent = `Ougi \/ \$\{ougiCount\}`/);
  assert.match(presentationFixes, /ougiCard\?\.remove\(\)/);
  assert.match(presentationFixes, /label\.textContent = 'SA \/ DA \/ TA'/);
  assert.match(presentationFixes, /label\.textContent = 'Main Character'/);
  assert.match(presentationFixes, /\(\?:\^\|_\)sp/);
  assert.match(ui, /applySharedCombatPresentationFixes\(section\)/);
});
