import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('combat layout selection defaults to Combat Cockpit and persists locally', () => {
  assert.match(ui, /const LAYOUT_KEY = 'gbfit:combat-layout'/);
  assert.match(ui, /\?\? 'combat-cockpit'/);
  assert.match(ui, /return 'combat-cockpit'/);
  assert.match(ui, /localStorage\.setItem\(LAYOUT_KEY, layout\)/);
  assert.match(ui, /COMBAT_LAYOUT_PRESETS\.map/);
});
