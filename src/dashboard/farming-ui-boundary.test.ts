import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./farming-ui.ts', import.meta.url), 'utf8');
const wiki = readFileSync(new URL('./wiki-sources.ts', import.meta.url), 'utf8');
const assets = readFileSync(new URL('./wiki-assets.ts', import.meta.url), 'utf8');
const goals = readFileSync(new URL('./goals-ui.ts', import.meta.url), 'utf8');
const goalsCss = readFileSync(new URL('./goals.css', import.meta.url), 'utf8');
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
  assert.match(ui, /document\.addEventListener\('toggle', handleToggle, true\)/);
  assert.match(ui, /details\.matches\('\[data-goal-requirements\]'\)/);
  assert.match(ui, /loadWikiMaterialThumbnails\(titles, \{ itemIdsByTitle \}\)/);
  assert.match(ui, /syncGoalInlineFarming\(activeGoals\)/);
  assert.doesNotMatch(ui, /renderFocusSurface\(goalsView/);
});

test('Goals prefetch thumbnail metadata with resolved item ids before the first requirements expand', () => {
  assert.match(ui, /queueMicrotask\(\(\) => void prefetchGoalMaterialThumbnails\(\)\)/);
  assert.match(ui, /if \(!app\?\.querySelector\('\[data-goals-view\]'\) \|\| localState !== 'ready'\) return;/);
  assert.match(ui, /goalThumbnailUrls = new Map/);
  assert.match(ui, /goalThumbnailPrefetch/);
  assert.match(ui, /const itemIdsByTitle = resolvedGoalItemIdsByTitle\(\)/);
  assert.match(ui, /void prefetchGoalMaterialThumbnails\(\);/);
  assert.match(ui, /applyPrefetchedGoalIcons\(details\)/);
});

test('Goal icon lookup uses only unambiguous technical ids from resolved local materials', () => {
  const start = ui.indexOf('function resolvedGoalItemIdsByTitle');
  const end = ui.indexOf('function goalForDetails', start);
  assert.ok(start >= 0 && end > start);
  const resolver = ui.slice(start, end);
  assert.match(resolver, /material\.itemId\?\.trim\(\)/);
  assert.match(resolver, /if \(current && current !== itemId\)/);
  assert.match(resolver, /ambiguous\.add\(key\)/);
});

test('Goal icons hydrate after local planner readiness and before Farming source resolution', () => {
  const start = ui.indexOf('async function hydrateGoalRequirements');
  const end = ui.indexOf('function resolvedGoalItemIdsByTitle', start);
  assert.ok(start >= 0 && end > start);
  const hydration = ui.slice(start, end);
  assert.match(hydration, /localState !== 'ready'/);
  assert.ok(hydration.indexOf('await hydrateGoalRequirementIcons(details)') >= 0);
  assert.ok(hydration.indexOf('await hydrateGoalRequirementIcons(details)') < hydration.indexOf('const goal = goalForDetails(details)'));
  assert.match(hydration, /querySelectorAll<HTMLImageElement>\('\[data-goal-material-icon\]'\)/);
  assert.match(hydration, /iconHydrationInFlight/);
});

test('Goals hide unavailable/loading farming copy because the material name is the Wiki link', () => {
  assert.match(goals, /<a class="goal-requirement-name" href=/);
  assert.match(goalsCss, /\.goal-farming-state \{ display: none; \}/);
});

test('farming UI updates its observed containers idempotently', () => {
  assert.match(ui, /if \(container\.innerHTML !== body\) container\.innerHTML = body;/);
  assert.match(ui, /if \(target\.innerHTML !== body\) target\.innerHTML = body;/);
});
