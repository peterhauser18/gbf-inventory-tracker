import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deferredWikiImageTarget } from '../dashboard/wiki-image-loader.ts';
import { resolveWikiRaidIcon, wikiRaidPageTitles } from './wiki-raid-icons.ts';

test('raid names resolve to the GBF Wiki raid page naming used by the Raids index', () => {
  assert.deepEqual(wikiRaidPageTitles('Osiris'), ['Osiris (Raid)', 'Osiris']);
  assert.deepEqual(wikiRaidPageTitles('Lindwurm (Raid)'), ['Lindwurm (Raid)']);
  assert.deepEqual(wikiRaidPageTitles('Lvl 200 Narophirmidas'), ['Narophirmidas (Raid)', 'Narophirmidas']);
  assert.deepEqual(wikiRaidPageTitles('Lv. 250 Hexachromatic Hierarch'), [
    'Hexachromatic Hierarch (Raid)',
    'Hexachromatic Hierarch',
  ]);
  assert.deepEqual(wikiRaidPageTitles('  '), []);
});

test('raid icon resolution prefers an already-observed local boss image before Wiki', async () => {
  let wikiCalled = false;
  let localName = '';
  const local = 'data:image/png;base64,AAAA';
  const resolved = await resolveWikiRaidIcon(
    'Lvl 200 Narophirmidas',
    async () => {
      wikiCalled = true;
      return new Map();
    },
    async (raidName) => {
      localName = raidName;
      return local;
    },
  );
  assert.equal(localName, 'Narophirmidas');
  assert.equal(resolved, local);
  assert.equal(wikiCalled, false);
});

test('raid icon resolution falls back to the cached Wiki thumbnail pipeline and defers image loading', async () => {
  let requested: readonly string[] = [];
  const direct = 'https://gbf.wiki/images/example-osiris.png';
  const resolved = await resolveWikiRaidIcon(
    'Lvl 120 Osiris',
    async (titles) => {
      requested = [...titles];
      return new Map([
        ['osiris (raid)', direct],
        ['osiris', undefined],
      ]);
    },
    async () => undefined,
  );
  assert.deepEqual(requested, ['Osiris (Raid)', 'Osiris']);
  assert.equal(deferredWikiImageTarget(resolved), direct);
});

test('live Combat boss hydration remains passive and uses the shared raid icon resolver', () => {
  const source = readFileSync(new URL('./live-ui-fixes.ts', import.meta.url), 'utf8');
  const resolver = readFileSync(new URL('./wiki-raid-icons.ts', import.meta.url), 'utf8');
  assert.match(source, /resolveWikiRaidIcon/);
  assert.match(source, /raid\.raidName/);
  assert.match(resolver, /readObservedRaidBossIconDataUrl/);
  assert.match(resolver, /raidNameWithoutLevelPrefix/);
  assert.doesNotMatch(source, /enemy_id|Enemy_Icon_/);
  assert.doesNotMatch(resolver, /granbluefantasy\.jp|akamaized\.net/);
});
