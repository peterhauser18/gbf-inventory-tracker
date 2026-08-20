import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const finalPolish = readFileSync(new URL('./cockpit-final-polish.ts', import.meta.url), 'utf8');

test('normal live Combat updates patch the existing cockpit instead of replacing the whole section', () => {
  const render = /function renderSectionIfChanged[\s\S]*?function decorateSection/.exec(ui)?.[0] ?? '';
  const patch = /function patchLiveCombatMarkup[\s\S]*?function activeCombatCardsByKey/.exec(ui)?.[0] ?? '';

  assert.match(render, /selected === 'combat' && patchLiveCombatMarkup\(section, markup\)/);
  assert.ok(
    render.indexOf('patchLiveCombatMarkup(section, markup)') < render.indexOf('section.innerHTML = markup'),
    'stable live patch must be attempted before the structural full-render fallback',
  );
  assert.match(patch, /activeCombatCardsByKey/);
  assert.doesNotMatch(patch, /section\.innerHTML|currentList\.innerHTML|replaceWith/);
  assert.match(ui, /patchLabeledStrongValues\(current, next, '\.live-stat'\)/);
  assert.match(ui, /patchCockpitRows\(current, next\)/);
  assert.match(ui, /patchPartyCards\(current, next\)/);
});

test('a local actor-image cache miss is retried after the observed image finishes caching', () => {
  const source = /function observedActorImageSource\(assetId: string\)[\s\S]*?\n\}/.exec(finalPolish)?.[0] ?? '';

  assert.match(source, /if \(!blob\) \{\s*observedActorImagePromises\.delete\(assetId\);\s*return undefined;/s);
  assert.match(source, /\.catch\(\(\) => \{\s*observedActorImagePromises\.delete\(assetId\);\s*return undefined;/s);
  assert.match(source, /if \(existing\) return existing/);
});
