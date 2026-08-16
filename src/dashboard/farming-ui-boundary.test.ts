import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./farming-ui.ts', import.meta.url), 'utf8');
const wiki = readFileSync(new URL('./wiki-sources.ts', import.meta.url), 'utf8');
const logic = readFileSync(new URL('./farming.ts', import.meta.url), 'utf8');
const source = `${ui}\n${wiki}\n${logic}`;

test('phase 3 adds only credential-free public Wiki reads and local preference writes', () => {
  assert.doesNotMatch(source, /game\.granbluefantasy\.jp/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(wiki, /https:\/\/gbf\.wiki\/api\.php/);
  assert.match(wiki, /credentials: 'omit'/);
  assert.match(wiki, /referrerPolicy: 'no-referrer'/);
  assert.match(ui, /saveDropPreferences\(next\)/);
});

test('farming UI updates its observed container idempotently', () => {
  assert.match(ui, /if \(container\.innerHTML !== body\) container\.innerHTML = body;/);
});
