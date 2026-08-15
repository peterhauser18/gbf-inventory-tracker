import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSafeExternalImageUrl, resolveWikiUrl, wikiPageUrl } from './resolver.ts';

test('builds exact wiki pages and public search fallbacks without account instance data', () => {
  assert.equal(wikiPageUrl('Maria Theresa'), 'https://gbf.wiki/Maria_Theresa');
  const search = resolveWikiUrl({ publicId: '3049999999' });
  assert.match(search, /^https:\/\/gbf\.wiki\/index\.php\?/);
  assert.equal(new URL(search).searchParams.get('search'), '3049999999');
  assert.ok(!search.includes('account-id-fixture'));
});

test('only accepts explicitly allowed non-Cygames image hosts', () => {
  assert.equal(
    resolveSafeExternalImageUrl('https://gbf.wiki/images/fixture.png'),
    'https://gbf.wiki/images/fixture.png',
  );
  assert.equal(resolveSafeExternalImageUrl('https://prd-game-a-granbluefantasy.akamaized.net/assets/fixture.png'), null);
  assert.equal(resolveSafeExternalImageUrl('https://game.granbluefantasy.jp/assets/fixture.png'), null);
  assert.equal(resolveSafeExternalImageUrl('https://mizagbf.github.io/GBFAL/fixture.png'), null);
  assert.equal(
    resolveSafeExternalImageUrl('https://assets.example.test/fixture.png', new Set(['assets.example.test'])),
    'https://assets.example.test/fixture.png',
  );
});
