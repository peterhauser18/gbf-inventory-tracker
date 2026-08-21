import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const finalPolish = readFileSync(new URL('./cockpit-final-polish.ts', import.meta.url), 'utf8');
const attackModes = readFileSync(new URL('./cockpit-attack-modes.ts', import.meta.url), 'utf8');
const finalPolishCss = readFileSync(new URL('./cockpit-final-polish.css', import.meta.url), 'utf8');

test('normal live Combat updates patch the existing cockpit instead of replacing or moving the whole card', () => {
  const render = /function renderSectionIfChanged[\s\S]*?function decorateSection/.exec(ui)?.[0] ?? '';
  const patch = /function patchLiveCombatMarkup[\s\S]*?function activeCombatCardsByKey/.exec(ui)?.[0] ?? '';

  assert.match(render, /selected === 'combat' && patchLiveCombatMarkup\(section, markup\)/);
  assert.ok(
    render.indexOf('patchLiveCombatMarkup(section, markup)') < render.indexOf('section.innerHTML = markup'),
    'stable live patch must be attempted before the structural full-render fallback',
  );
  assert.match(patch, /activeCombatCardsByKey/);
  assert.doesNotMatch(patch, /section\.innerHTML|currentList\.innerHTML|currentList\.append\(|replaceWith/);
  assert.match(patch, /previous\.nextElementSibling !== currentCard/);
  assert.match(ui, /patchLabeledStrongValues\(current, next, '\.live-stat'\)/);
  assert.match(ui, /patchCockpitRows\(current, next\)/);
  assert.match(ui, /patchPartyCards\(current, next\)/);
});

test('local battle portrait lookup retries misses, prefers exact ds id and keeps an installed image stable', () => {
  const cacheRead = /function observedActorImageSource\(assetId: string\)[\s\S]*?\n\}/.exec(finalPolish)?.[0] ?? '';
  const actorLookup = /async function observedActorImageSourceForActor[\s\S]*?\n\}/.exec(finalPolish)?.[0] ?? '';
  const replacement = /function replaceActorImages[\s\S]*?\n\}/.exec(finalPolish)?.[0] ?? '';

  assert.match(cacheRead, /if \(!blob\) \{\s*observedActorImagePromises\.delete\(assetId\);\s*return undefined;/s);
  assert.match(cacheRead, /\.catch\(\(\) => \{\s*observedActorImagePromises\.delete\(assetId\);\s*return undefined;/s);
  assert.match(cacheRead, /if \(existing\) return existing/);
  assert.match(actorLookup, /const ids = \[actorVisualImageId\(actor\), actor\.id\]/);
  assert.match(replacement, /existing\?\.getAttribute\('src'\) === source\) continue/);
});

test('one-second decoration does not reorder stable rows or rebuild SA DA TA cells', () => {
  const table = /function normalizeCockpitTable[\s\S]*?function normalizeCockpitPartyCards/.exec(finalPolish)?.[0] ?? '';
  const party = /function normalizeCockpitPartyCards[\s\S]*?function createCockpitRow/.exec(finalPolish)?.[0] ?? '';
  const row = /function normalizeRow[\s\S]*?function attackModeLabel/.exec(attackModes)?.[0] ?? '';

  assert.doesNotMatch(table, /table\.append\(row\)/);
  assert.doesNotMatch(party, /party\.append\(partyCard\)/);
  assert.match(table, /previous\.nextElementSibling !== row/);
  assert.match(party, /previous\.nextElementSibling !== partyCard/);
  assert.match(row, /if \(cells\.length !== 3\)/);
  assert.doesNotMatch(row, /querySelectorAll\('\.cockpit-attack-mode'\)\.forEach/);
});

test('compact Characters use larger landscape cards without a transient vertical table scrollbar', () => {
  assert.match(finalPolishCss, /cockpit-characters-panel \.party-cards-compact\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(finalPolishCss, /party-card-visual\s*\{[^}]*aspect-ratio:\s*16 \/ 9/s);
  assert.match(finalPolishCss, /cockpit-table\s*\{[^}]*overflow-y:\s*hidden/s);
});
