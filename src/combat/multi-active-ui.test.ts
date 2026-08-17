import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('./dashboard-multi-active.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');

test('combat dashboard renders one independent wrapper per active raid with export and manual finalization', () => {
  assert.match(dashboard, /this\.active\.map/);
  assert.match(dashboard, /data-active-combat-key/);
  assert.match(dashboard, /data-active-raid-export/);
  assert.match(dashboard, /data-active-raid-finalize/);
  assert.match(dashboard, /Raid manuell abschließen/);
  assert.match(dashboard, /serializeRaidParse\(raid\)/);
});

test('manual finalization is local-only and does not add gameplay transport', () => {
  assert.match(dashboard, /manualFinalizeActiveRaid/);
  assert.doesNotMatch(dashboard, /\bfetch\s*\(/);
  assert.doesNotMatch(dashboard, /XMLHttpRequest/);
  assert.doesNotMatch(dashboard, /chrome\.debugger/);
});

test('storage keeps multiple active rows and preserves the pre-migration latest row until that same raid is finalized', () => {
  assert.match(storage, /interface ActiveRow \{ key: string; parse: NormalizedRaidParse; \}/);
  assert.match(storage, /async function saveActive[\s\S]*?objectStore\(ACTIVE_STORE\)\.put\(\{ key, parse \}[\s\S]*?db\.close\(\);\s*\}/);
  assert.match(storage, /getActiveCombatRaids/);
  assert.match(storage, /manualFinalizedKeys/);
  assert.match(storage, /capturedRaidLocalId/);
  assert.match(storage, /if \(deleteLegacy\) store\.delete\(LEGACY_LATEST_KEY\)/);
});
