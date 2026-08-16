import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./farming-ui.ts', import.meta.url), 'utf8');
const wiki = readFileSync(new URL('./wiki-sources.ts', import.meta.url), 'utf8');
const assets = readFileSync(new URL('./wiki-assets.ts', import.meta.url), 'utf8');
const goals = readFileSync(new URL('./goals-ui.ts', import.meta.url), 'utf8');
const logic = readFileSync(new URL('./farming.ts', import.meta.url), 'utf8');
const source = `${ui}\n${wiki}\n${assets}\n${logic}`;

test('phase 3 adds only credential-free public Wiki reads and local preference writes', () => {
  assert.doesNotMatch(source, /game\.granbluefantasy\.jp/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
  assert.match(wiki, /https:\/\/gbf\.wiki\/api\.php/);
  assert.match(assets, /https:\/\/gbf\.wiki\/api\.php/);
  assert.match(wiki, /credentials: 'omit'/);
  assert.match(assets, /credentials: 'omit'/);
  assert.match(wiki, /referrerPolicy: 'no-referrer'/);
  assert.match(assets, /referrerPolicy: 'no-referrer'/);
  assert.match(ui, /saveDropPreferences\(next\)/);
});

test('Goals keep Wiki assets lazy and inline instead of restoring a broad Farming panel', () => {
  assert.match(goals, /<details class="goal-requirements" data-goal-requirements>/);
  assert.match(goals, /data-goal-material-icon data-wiki-title=/);
  assert.doesNotMatch(goals, /data-goal-material-icon[^>]+src=/);
  assert.match(goals, /data-goal-material-farming/);
  assert.match(ui, /closest<HTMLElement>\('\.goal-requirements-summary'\)/);
  assert.match(ui, /loadWikiMaterialThumbnails\(titles\)/);
  assert.match(ui, /syncGoalInlineFarming\(activeGoals\)/);
  assert.doesNotMatch(ui, /renderFocusSurface\(goalsView/);
});

test('Goal icons hydrate before Farming planner state is required', () => {
  const start = ui.indexOf('async function hydrateGoalRequirements');
  const end = ui.indexOf('function goalForDetails', start);
  assert.ok(start >= 0 && end > start);
  const hydration = ui.slice(start, end);
  assert.ok(hydration.indexOf('await hydrateGoalRequirementIcons(details)') >= 0);
  assert.ok(hydration.indexOf('await hydrateGoalRequirementIcons(details)') < hydration.indexOf('const goal = goalForDetails(details)'));
  assert.match(hydration, /querySelectorAll<HTMLImageElement>\('\[data-goal-material-icon\]'\)/);
  assert.match(hydration, /iconHydrationInFlight/);
});

test('farming UI updates its observed containers idempotently', () => {
  assert.match(ui, /if \(container\.innerHTML !== body\) container\.innerHTML = body;/);
  assert.match(ui, /if \(target\.innerHTML !== body\) target\.innerHTML = body;/);
});
