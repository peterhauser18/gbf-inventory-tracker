import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('Combat and Raid History use the fixed Combat Cockpit layout without persisted layout selection', () => {
  assert.match(ui, /const layout: CombatLayoutPreset = 'combat-cockpit'/);
  assert.match(ui, /controller\.renderCombat\(layout\)/);
  assert.match(ui, /controller\.renderRaids\(query, layout\)/);
  assert.doesNotMatch(ui, /const LAYOUT_KEY = 'gbfit:combat-layout'/);
  assert.doesNotMatch(ui, /localStorage\.setItem\(LAYOUT_KEY, layout\)/);
  assert.doesNotMatch(ui, /COMBAT_LAYOUT_PRESETS\.map|combat-layout-select|loadLayoutPreference/);
});
