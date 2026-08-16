import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renderWikiDetailGameplay } from './detail-wiki.ts';
import type { EntityMetadataIndex } from './wiki-metadata.ts';
import type { WikiGameplayMetadataIndex } from './wiki-gameplay-metadata.ts';

const source = readFileSync(new URL('./detail-wiki-ui.ts', import.meta.url), 'utf8');
const searchBootstrap = readFileSync(new URL('./global-entity-search-ui.ts', import.meta.url), 'utf8');
const stashRenderer = readFileSync(new URL('./stash-inline.ts', import.meta.url), 'utf8');

const gameplay: WikiGameplayMetadataIndex = {
  charactersById: new Map([['3040000000', [{ name: 'Fixture Skill', description: 'Remove 1 buff.' }]]]),
  weaponsByTitle: new Map([['fixture weapon', [{ name: 'Fixture Weapon Skill', description: 'Boost to ATK.' }]]]),
  summonsById: new Map([['2040000000', {
    masterId: '2040000000',
    callName: 'Fixture Call',
    calls: ['Base call.', '3-star call.'],
    auras: ['Base aura.', '3-star aura.'],
  }]]),
  sourceQuality: { characters: 'known', weapons: 'known', summons: 'known' },
};

const entities: EntityMetadataIndex = {
  characters: new Map(),
  weapons: new Map([['1040000000', {
    masterId: '1040000000', name: 'Fixture Weapon', wikiTitle: 'Fixture Weapon',
  }]]),
  summons: new Map(),
};

test('Character detail renders active Wiki skill names and escaped descriptions', () => {
  const html = renderWikiDetailGameplay('CHARACTER', '3040000000', 4, gameplay, entities);
  assert.match(html, /<h4>Skills<\/h4>/);
  assert.match(html, /Fixture Skill/);
  assert.match(html, /Remove 1 buff\./);
});

test('Weapon detail resolves through public identity metadata and works independently of inventory key', () => {
  const html = renderWikiDetailGameplay('WEAPON', '1040000000', 4, gameplay, entities);
  assert.match(html, /<h4>Weapon skills<\/h4>/);
  assert.match(html, /Fixture Weapon Skill/);
  assert.doesNotMatch(html, /stash-weapon|weapon:/);
});

test('Summon detail keeps Call and Aura separate and does not invent an Aura name', () => {
  const html = renderWikiDetailGameplay('SUMMON', '2040000000', 3, gameplay, entities);
  assert.match(html, /<h4>Call<\/h4>[\s\S]*Fixture Call[\s\S]*3-star call\./);
  assert.match(html, /<h4>Aura<\/h4>[\s\S]*3-star aura\./);
  assert.doesNotMatch(html, /<strong>Aura<\/strong>/);
});

test('missing gameplay metadata renders a compact unavailable state', () => {
  const html = renderWikiDetailGameplay('CHARACTER', 'missing', undefined, gameplay, entities);
  assert.match(html, /Skills unavailable from current public Wiki metadata/);
});

test('normal Character Weapon and Summon facts move to a closed disclosure at the panel bottom', () => {
  assert.match(source, /kind === 'CHARACTER' \|\| kind === 'WEAPON' \|\| kind === 'SUMMON'/);
  assert.match(source, /document\.createElement\('details'\)/);
  assert.match(source, /disclosure\.dataset\.observedFacts = 'collapsed'/);
  assert.doesNotMatch(source, /disclosure\.open\s*=|setAttribute\(['"]open/);
  assert.match(source, /factsSection\.remove\(\);\s*panel\.append\(disclosure\)/);
  assert.doesNotMatch(source, /ETERNAL|EVOKER/);
});

test('stash-contained weapons reuse the same normal Weapon detail path', () => {
  assert.match(stashRenderer, /data-detail=/);
  assert.match(stashRenderer, /data-stash-parent=/);
  assert.match(source, /factValue\(factsSection, 'Master ID'\)/);
  assert.doesNotMatch(source, /stash-weapon:/);
});

test('detail enhancement is installed once with the existing post-render Dashboard enhancement and fetches no images', () => {
  assert.match(searchBootstrap, /installWikiDetailEnhancement\(\)/);
  assert.match(source, /let metadataPromise:/);
  assert.match(source, /if \(!metadataPromise\)/);
  assert.doesNotMatch(source, /<img|data-entity-image|game\.granbluefantasy\.jp|chrome\.debugger/);
});
