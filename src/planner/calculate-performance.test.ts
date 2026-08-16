import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./calculate.ts', import.meta.url), 'utf8');

test('planner caches treasure lookup maps instead of rescanning the full treasure list per material', () => {
  assert.match(source, /TREASURE_LOOKUP_CACHE = new WeakMap/);
  assert.match(source, /for \(const item of snapshot\.treasures\)/);
  assert.doesNotMatch(source, /snapshot\.treasures\.find\(/);
  assert.doesNotMatch(source, /snapshot\.treasures\.filter\(/);
});
