import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./loadout-ui.ts', import.meta.url), 'utf8');

test('cached weapon grids are visibly distinguished from freshly observed grids', () => {
  assert.match(source, /weaponGridSource === 'cached'/);
  assert.match(source, /Previously observed/);
  assert.match(source, /weaponGridObservedAt/);
  assert.match(source, /Cached/);
});
