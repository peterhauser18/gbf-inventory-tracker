import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rosterUi = readFileSync(new URL('./roster-ui.ts', import.meta.url), 'utf8');
const rosterLogic = readFileSync(new URL('./roster-capabilities.ts', import.meta.url), 'utf8');
const wikiCargo = readFileSync(new URL('./wiki-cargo.ts', import.meta.url), 'utf8');
const compareUi = readFileSync(new URL('../combat/combat-compare-ui.ts', import.meta.url), 'utf8');
const compareLogic = readFileSync(new URL('../combat/comparison.ts', import.meta.url), 'utf8');
const source = `${rosterUi}\n${rosterLogic}\n${compareUi}\n${compareLogic}`;

const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');


test('phase 4 introduces no GBF request, debugger, runtime messaging, timer polling or account persistence path', () => {
  assert.doesNotMatch(source, /game\.granbluefantasy\.jp/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.doesNotMatch(compareUi, /put\s*\(|add\s*\(|setItem\s*\(|storage\.(?:local|session)\.set/);
});

test('roster Wiki lookup remains bulk public and credential-free through the shared Cargo loader', () => {
  assert.match(rosterLogic, /from ['"]\.\/wiki-cargo\.ts['"]/);
  assert.match(rosterLogic, /loadWikiCargoRows\(/);
  assert.match(rosterLogic, /loadWikiCharacterSkillRows\(/);
  assert.match(wikiCargo, /https:\/\/gbf\.wiki\/api\.php/);
  assert.match(wikiCargo, /credentials: 'omit'/);
  assert.match(wikiCargo, /referrerPolicy: 'no-referrer'/);
  assert.doesNotMatch(wikiCargo, /searchParams\.set\(['"]where/);
  assert.doesNotMatch(wikiCargo, /searchParams\.set\(['"]ids/);
});

test('combat comparison UI explicitly labels actor lists as observed contributors rather than full party', () => {
  assert.match(compareUi, /Observed contributors are not guaranteed to be the complete party/);
  assert.doesNotMatch(compareUi, />Team</);
});

test('combat comparison mutation sync keeps button text idempotent', () => {
  assert.ok(compareUi.includes('if (button.textContent !== label) button.textContent = label;'));
});

test('roster controller is installed before dashboard restore navigation can replay a roster click', () => {
  assert.ok(dashboardHtml.indexOf('/src/dashboard/roster-ui.ts') < dashboardHtml.indexOf('/src/dashboard-entry.ts'));
});
