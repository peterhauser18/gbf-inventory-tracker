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

test('combat comparison uses the observed party slot and omits contributor and weapon-grid summaries', () => {
  assert.match(compareUi, /Party slot \$\{loadout\.deckId\}/);
  assert.doesNotMatch(compareUi, /Observed in both|Observed only in|Weapon Grid/);
});

test('combat comparison excludes drop facts from its UI and derived comparison data', () => {
  assert.doesNotMatch(compareUi, /\.drops\b|dropsQuality|Drop comparison/i);
  assert.doesNotMatch(compareLogic, /\.drops\b|dropsQuality/);
});

test('combat comparison mutation sync keeps button text idempotent', () => {
  assert.ok(compareUi.includes('if (button.textContent !== label) button.textContent = label;'));
  assert.match(compareUi, /panel\.dataset\.raidComparisonKey !== selectionKey/);
  assert.match(compareUi, /mutations\.some\(requiresRaidComparisonSync\)/);
  assert.doesNotMatch(compareUi, /new MutationObserver\(scheduleSync\)/);
  assert.doesNotMatch(compareUi, /requiresRaidComparisonSync[\s\S]*combat-image/);
});

test('roster controller is installed before dashboard restore navigation can replay a roster click', () => {
  assert.ok(dashboardHtml.indexOf('/src/dashboard/roster-ui.ts') < dashboardHtml.indexOf('/src/dashboard-entry.ts'));
});
