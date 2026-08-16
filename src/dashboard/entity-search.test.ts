import assert from 'node:assert/strict';
import test from 'node:test';
import type { DashboardCard, DashboardViewModel } from './model.ts';
import { entityOpenPlan, searchDashboardEntities } from './entity-search.ts';

function card(
  key: string,
  kind: DashboardCard['kind'],
  title: string,
  subtitle: string,
  detailValues: string[] = [],
  children?: DashboardCard[],
): DashboardCard {
  return {
    key,
    kind,
    title,
    subtitle,
    quality: 'known',
    wikiUrl: 'https://gbf.wiki/',
    detailFields: detailValues.map((value, index) => ({ label: `Field ${index}`, value })),
    children,
  };
}

function view(): DashboardViewModel {
  const stashChild = card('stash-weapon:3:w-stash', 'weapon', 'Higurashi', 'Lv 150 · Skill 15', ['3', 'w-stash', '1040009999']);
  const stash = card('stash:3', 'stash', 'Weapon Stash', '1 observed weapon', [], [stashChild]);
  stash.detailFields = [{ label: 'Stash ID', value: '3' }];
  return {
    capturedAt: 1,
    quality: {
      characters: 'known',
      weapons: 'known',
      summons: 'known',
      artifacts: 'unknown',
      treasures: 'known',
      consumables: 'known',
      tickets: 'known',
      accountStatus: 'unknown',
      progression: 'known',
    },
    stats: [],
    eternals: [card('eternal:3040036000', 'eternal', 'Seox', 'Lv 150', ['3040036000']) as DashboardViewModel['eternals'][number]],
    evokers: [card('evoker:3040160000', 'evoker', 'Nier', 'Lv 100', ['3040160000']) as DashboardViewModel['evokers'][number]],
    characters: [card('character:c1', 'character', 'Belial Fan', 'Lv 80', ['c1', '3049999999'])],
    weapons: [card('weapon:w1', 'weapon', 'Higurashi Replica', 'Lv 1', ['w1', '1040000001'])],
    summons: [card('summon:s1', 'summon', 'Belial', 'Lv 150 · Uncap 4', ['s1', '2040094000'])],
    treasures: [card('treasure:10', 'treasure', 'Damascus Crystal', 'Owned 20', ['10'])],
    consumables: [card('consumable:recovery::20', 'consumable', 'Elixir', 'recovery · Owned 3', ['20'])],
    tickets: [card('ticket:draw::30', 'ticket', 'Premium Draw Ticket', 'draw · Owned 2', ['30'])],
    stashes: [stash],
  };
}

test('search is case-insensitive and partial across local categories', () => {
  const model = view();
  assert.equal(searchDashboardEntities(model, 'hIGu')[0]?.title, 'Higurashi Replica');
  const belial = searchDashboardEntities(model, 'Bel').find((result) => result.title === 'Belial');
  assert.equal(belial?.typeLabel, 'Summon');
  assert.equal(belial?.section, 'summons');
});

test('display-name prefix outranks generic detail-field matches and ties stay stable', () => {
  const model = view();
  model.weapons.unshift(card('weapon:detail', 'weapon', 'Unrelated', 'Lv 1', ['Higurashi technical note']));
  const results = searchDashboardEntities(model, 'Higu');
  assert.equal(results[0]?.title, 'Higurashi Replica');
  assert.equal(results[1]?.title, 'Higurashi');
  assert.ok(results.findIndex((result) => result.title === 'Unrelated') > 1);
});

test('technical fallback ids remain searchable without inventing a name', () => {
  const model = view();
  model.weapons.push(card('weapon:fallback', 'weapon', 'Weapon 1040099999', 'Details partial / unknown', ['instance-x', '1040099999']));
  const result = searchDashboardEntities(model, '1040099999')[0];
  assert.equal(result?.title, 'Weapon 1040099999');
  assert.equal(result?.typeLabel, 'Weapon');
});

test('stash weapons preserve provenance and open through their owning stash', () => {
  const result = searchDashboardEntities(view(), '1040009999')[0];
  assert.equal(result?.typeLabel, 'Stash Weapon');
  assert.equal(result?.section, 'stashes');
  assert.equal(result?.parentKey, 'stash:3');
  assert.match(result?.subtitle ?? '', /^Stash 3 ·/);
  assert.deepEqual(result ? entityOpenPlan(result) : undefined, {
    section: 'stashes',
    detailKeys: ['stash:3', 'stash-weapon:3:w-stash'],
  });
});

test('all required local families are indexed while an empty query stays lazy', () => {
  const model = view();
  assert.deepEqual(searchDashboardEntities(model, ''), []);
  const expectations = new Map([
    ['Seox', 'Eternal'],
    ['Nier', 'Evoker'],
    ['Belial Fan', 'Character'],
    ['Higurashi Replica', 'Weapon'],
    ['Belial', 'Summon'],
    ['Damascus Crystal', 'Treasure'],
    ['Elixir', 'Consumable'],
    ['Premium Draw Ticket', 'Ticket'],
    ['Weapon Stash', 'Weapon Stash'],
    ['Higurashi', 'Stash Weapon'],
  ]);
  for (const [title, typeLabel] of expectations) {
    const result = searchDashboardEntities(model, title)[0];
    assert.equal(result?.title, title);
    assert.equal(result?.typeLabel, typeLabel);
  }
});
