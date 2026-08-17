import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deferredWikiImageTarget } from '../dashboard/wiki-image-loader.ts';
import { resolveWikiRaidIcon, wikiRaidPageTitles } from './wiki-raid-icons.ts';

test('raid names resolve to the GBF Wiki raid page naming used by the Raids index', () => {
  assert.deepEqual(wikiRaidPageTitles('Osiris'), ['Osiris (Raid)', 'Osiris']);
  assert.deepEqual(wikiRaidPageTitles('Lindwurm (Raid)'), ['Lindwurm (Raid)']);
  assert.deepEqual(wikiRaidPageTitles('  '), []);
});

test('raid icon resolution reuses the cached Wiki thumbnail pipeline and defers image loading', async () => {
  let requested: readonly string[] = [];
  const direct = 'https://gbf.wiki/images/example-osiris.png';
  const resolved = await resolveWikiRaidIcon('Osiris', async (titles) => {
    requested = [...titles];
    return new Map([
      ['osiris (raid)', direct],
      ['osiris', undefined],
    ]);
  });
  assert.deepEqual(requested, ['Osiris (Raid)', 'Osiris']);
  assert.equal(deferredWikiImageTarget(resolved), direct);
});

test('live Combat boss hydration uses raid-name Wiki pages rather than requiring an enemy asset id', () => {
  const source = readFileSync(new URL('./live-ui-fixes.ts', import.meta.url), 'utf8');
  assert.match(source, /resolveWikiRaidIcon/);
  assert.match(source, /raid\.raidName/);
  assert.doesNotMatch(source, /enemy_id|Enemy_Icon_/);
});
