import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./goals-ui.ts', import.meta.url), 'utf8');
const logic = readFileSync(new URL('./goals.ts', import.meta.url), 'utf8');
const source = `${ui}\n${logic}`;

test('phase 2 goals stay local and do not introduce GBF request or debugger primitives', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(ui, /if \(button\.textContent !== label\) button\.textContent = label;/);
  assert.match(source, /localStorage\.setItem\(GOAL_PINS_STORAGE_KEY/);
  assert.match(source, /loadAccountDatabase\(\)/);
});
