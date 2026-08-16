import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFarmingFocus,
  ensureRaidDropTracked,
  estimatePersonalRunsRemaining,
  parseWikiObtainRaidSources,
  type FarmingMaterial,
  type FarmingRaidRecord,
} from './farming.ts';

const material = (patch: Partial<FarmingMaterial> = {}): FarmingMaterial => ({
  key: 'treasures:name:tears of the apocalypse',
  name: 'Tears of the Apocalypse',
  state: 'known',
  required: 30,
  missing: 12,
  wikiTitle: 'Tears of the Apocalypse',
  ...patch,
});

const raid = (
  technicalId: string,
  name: string,
  quality: 'known' | 'partial' | 'unknown',
  drops: FarmingRaidRecord['drops'],
): FarmingRaidRecord => ({ raidTechnicalId: technicalId, raidName: name, dropsQuality: quality, drops });

test('Wiki Obtain parsing treats listed raid links as possible sources without personal observation', () => {
  const wiki = parseWikiObtainRaidSources(`
== Usage ==
Text
== Obtain ==
* [[Lucilius (Hard)]]
* Story event honor reward
* [[Prestige Pendants|Prestige Pendants Shop]]
== Notes ==
Later
`, 'Tears of the Apocalypse', 'https://gbf.wiki/Tears_of_the_Apocalypse', 'revision 123');
  assert.equal(wiki.state, 'known');
  assert.deepEqual(wiki.raids.map((source) => source.name), ['Lucilius (Hard)']);
  assert.equal(wiki.freshness, 'revision 123');
});


test('Wiki Obtain parsing accepts plain raid links only when the source text explicitly says drop from', () => {
  const wiki = parseWikiObtainRaidSources(`
== Obtain ==
* Drop from [[Luminiera Omega]].
* Purchase from [[Prestige Pendants|Prestige Pendants Shop]].
`, 'True Light Anima', 'https://gbf.wiki/True_Light_Anima');
  assert.equal(wiki.state, 'known');
  assert.deepEqual(wiki.raids.map((source) => source.name), ['Luminiera Omega']);
});

test('plain Drop from parsing does not promote incidental links on the same line to raid sources', () => {
  const wiki = parseWikiObtainRaidSources(`
== Obtain ==
* Drop from [[Luminiera Omega]]; see [[Treasure Trade]] for another acquisition method.
`, 'True Light Anima', 'https://gbf.wiki/True_Light_Anima');
  assert.equal(wiki.state, 'known');
  assert.deepEqual(wiki.raids.map((source) => source.name), ['Luminiera Omega']);
});

test('Wiki source parser recognizes Raids namespace links and does not turn no recognized raid into a negative claim', () => {
  const withRaid = parseWikiObtainRaidSources(`
== Obtain ==
* [[Raids:Ultimate Bahamut Impossible|Ultimate Bahamut (Impossible)]]
`, 'Gold Brick', 'https://gbf.wiki/Gold_Brick');
  assert.equal(withRaid.state, 'known');
  assert.equal(withRaid.raids[0]?.name, 'Ultimate Bahamut (Impossible)');

  const shopOnly = parseWikiObtainRaidSources(`
== Obtain ==
* [[Prestige Pendants|Prestige Pendants Shop]]
`, 'Example', 'https://gbf.wiki/Example');
  assert.equal(shopOnly.state, 'unavailable');
  assert.match(shopOnly.limitation ?? '', /no raid link/i);
});


test('materials without a modeled Wiki title do not guess a source page', () => {
  const guessed = parseWikiObtainRaidSources('== Obtain ==\n* Drop from [[Proto Bahamut (Impossible)]].', 'Primeval Horn', 'https://gbf.wiki/Primeval_Horn');
  const focus = buildFarmingFocus([
    material({ key: 'no-wiki', name: 'Primeval Horn', wikiTitle: undefined }),
  ], new Map([['primeval horn', guessed]]), [], []);
  assert.equal(focus[0]?.wiki, undefined);
  assert.equal(focus[0]?.sources.length, 0);
});

test('personal denominator uses known drop results only and estimate uses observed quantity per eligible run', () => {
  const wiki = parseWikiObtainRaidSources('== Obtain ==\n* [[Lucilius (Hard)]]', 'Tears of the Apocalypse', 'https://gbf.wiki/Tears_of_the_Apocalypse');
  const raids = [
    raid('raid-luci', 'Lucilius', 'known', [{ itemId: 'tear', name: 'Tears of the Apocalypse', quantity: 2 }]),
    raid('raid-luci', 'Lucilius', 'known', []),
    raid('raid-luci', 'Lucilius', 'partial', [{ itemId: 'tear', name: 'Tears of the Apocalypse', quantity: 9 }]),
  ];
  const focus = buildFarmingFocus([material()], new Map([['tears of the apocalypse', wiki]]), raids, []);
  const personal = focus[0]?.sources[0]?.personal;
  assert.ok(personal);
  assert.equal(personal.eligibleRuns, 2);
  assert.equal(personal.observedDropRuns, 1);
  assert.equal(personal.quantityReceived, 2);
  assert.equal(personal.appearanceRate, 0.5);
  assert.equal(personal.quantityPerEligibleRun, 1);
  assert.equal(personal.estimatedRunsRemaining, 12);
});

test('Wiki-listed source remains visible when no local history exists', () => {
  const wiki = parseWikiObtainRaidSources('== Obtain ==\n* [[Beelzebub (Raid)]]', 'Abyssal Wing', 'https://gbf.wiki/Abyssal_Wing');
  const focus = buildFarmingFocus([
    material({ key: 'wing', name: 'Abyssal Wing', wikiTitle: 'Abyssal Wing' }),
  ], new Map([['abyssal wing', wiki]]), [], []);
  assert.equal(focus[0]?.sources[0]?.wiki.name, 'Beelzebub (Raid)');
  assert.equal(focus[0]?.sources[0]?.personal, undefined);
});

test('relaxed local raid-name matching only succeeds for one unique technical identity', () => {
  const wiki = parseWikiObtainRaidSources('== Obtain ==\n* [[Proto Bahamut (Impossible)]]', 'Primeval Horn', 'https://gbf.wiki/Primeval_Horn');
  const one = buildFarmingFocus([
    material({ key: 'horn', name: 'Primeval Horn', wikiTitle: 'Primeval Horn', itemId: 'horn' }),
  ], new Map([['primeval horn', wiki]]), [raid('pbhl', 'Proto Bahamut', 'known', [])], []);
  assert.equal(one[0]?.sources[0]?.personal?.raidTechnicalId, 'pbhl');

  const ambiguous = buildFarmingFocus([
    material({ key: 'horn', name: 'Primeval Horn', wikiTitle: 'Primeval Horn', itemId: 'horn' }),
  ], new Map([['primeval horn', wiki]]), [
    raid('pbhl-a', 'Proto Bahamut', 'known', []),
    raid('pbhl-b', 'Proto Bahamut', 'known', []),
  ], []);
  assert.equal(ambiguous[0]?.sources[0]?.personal, undefined);
});

test('named material item ID is inferred only from one unique exact observed drop name', () => {
  const wiki = parseWikiObtainRaidSources('== Obtain ==\n* [[Beelzebub (Raid)]]', 'Abyssal Wing', 'https://gbf.wiki/Abyssal_Wing');
  const good = buildFarmingFocus([
    material({ key: 'wing', name: 'Abyssal Wing', wikiTitle: 'Abyssal Wing' }),
  ], new Map([['abyssal wing', wiki]]), [
    raid('bubs', 'Beelzebub (Raid)', 'known', [{ itemId: 'wing-1', name: 'Abyssal Wing', quantity: 1 }]),
  ], []);
  assert.equal(good[0]?.sources[0]?.personal?.itemId, 'wing-1');

  const ambiguous = buildFarmingFocus([
    material({ key: 'wing', name: 'Abyssal Wing', wikiTitle: 'Abyssal Wing' }),
  ], new Map([['abyssal wing', wiki]]), [
    raid('bubs', 'Beelzebub (Raid)', 'known', [
      { itemId: 'wing-1', name: 'Abyssal Wing', quantity: 1 },
      { itemId: 'wing-2', name: 'Abyssal Wing', quantity: 1 },
    ]),
  ], []);
  assert.equal(ambiguous[0]?.sources[0]?.personal?.itemId, undefined);
});

test('Track in Raids idempotently sets important and pinned without toggling either off', () => {
  const existing = {
    raidTechnicalId: 'bubs',
    pinnedItemIds: ['wing'],
    importantItemIds: [],
    updatedAt: 1,
  };
  const first = ensureRaidDropTracked(existing, 'bubs', 'wing', 2);
  assert.deepEqual(first.pinnedItemIds, ['wing']);
  assert.deepEqual(first.importantItemIds, ['wing']);
  const second = ensureRaidDropTracked(first, 'bubs', 'wing', 3);
  assert.strictEqual(second, first);
  assert.deepEqual(second.pinnedItemIds, ['wing']);
  assert.deepEqual(second.importantItemIds, ['wing']);
});

test('runs remaining estimate is withheld without positive known evidence', () => {
  assert.equal(estimatePersonalRunsRemaining(undefined, 10, 3), undefined);
  assert.equal(estimatePersonalRunsRemaining(10, 0, 3), undefined);
  assert.equal(estimatePersonalRunsRemaining(10, 10, 0), undefined);
  assert.equal(estimatePersonalRunsRemaining(10, 4, 2), 20);
});
