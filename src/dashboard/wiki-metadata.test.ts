import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWikiEntityMetadata, wikiEntityImageUrl } from './wiki-metadata.ts';

interface RecordedCall {
  url: URL;
  init?: RequestInit;
}

test('loads public wiki master tables without account-specific filters or credentials', async () => {
  const calls: RecordedCall[] = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    const table = url.searchParams.get('tables');
    const title = table === 'characters'
      ? { id: '3040000000', page: 'Fixture Character' }
      : table === 'weapons'
        ? { id: '1040000000', page: 'Fixture Weapon' }
        : { id: '2040000000', page: 'Fixture Summon' };
    return {
      ok: true,
      status: 200,
      json: async () => ({ cargoquery: [{ title }] }),
    };
  };

  const metadata = await loadWikiEntityMetadata(fetcher);

  assert.equal(metadata.characters.get('3040000000')?.name, 'Fixture Character');
  assert.equal(metadata.weapons.get('1040000000')?.name, 'Fixture Weapon');
  assert.equal(metadata.summons.get('2040000000')?.name, 'Fixture Summon');
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://gbf.wiki');
    assert.equal(call.url.pathname, '/api.php');
    assert.equal(call.url.searchParams.has('where'), false);
    assert.equal(call.url.searchParams.has('ids'), false);
    assert.equal(call.url.searchParams.get('fields'), 'id,_pageName=page');
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }
});

test('constructs only GBF Wiki entity image redirects', () => {
  assert.equal(
    wikiEntityImageUrl('character', '3040000000', 'Fixture Character'),
    'https://gbf.wiki/Special:Redirect/file/Fixture%20Character%20iconA.jpg',
  );
  assert.equal(
    wikiEntityImageUrl('weapon', '1040000000'),
    'https://gbf.wiki/Special:Redirect/file/Weapon%20ls%201040000000.jpg',
  );
  assert.equal(
    wikiEntityImageUrl('summon', '2040000000'),
    'https://gbf.wiki/Special:Redirect/file/Summon%20ls%202040000000.jpg',
  );
});
