import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWikiMaterialApiUrl, loadWikiMaterialRaidSources } from './wiki-sources.ts';

test('Wiki material source lookup is credential-free and parses the Obtain section', async () => {
  let requested = '';
  let init: RequestInit | undefined;
  const fetchImpl = (async (url: string | URL | Request, options?: RequestInit) => {
    requested = String(url);
    init = options;
    return new Response(JSON.stringify({
      parse: {
        revid: 99,
        wikitext: { '*': '== Obtain ==\n* [[Lucilius (Hard)]]\n* Story event honor reward' },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  const result = await loadWikiMaterialRaidSources('Tears of the Apocalypse', { fetchImpl });
  assert.match(requested, /^https:\/\/gbf\.wiki\/api\.php\?/);
  assert.equal(init?.credentials, 'omit');
  assert.equal(init?.referrerPolicy, 'no-referrer');
  assert.equal(result.state, 'known');
  assert.equal(result.raids[0]?.name, 'Lucilius (Hard)');
  assert.equal(result.freshness, 'revision 99');
});

test('Wiki request or parse failure stays unavailable rather than proving no source', async () => {
  const fetchImpl = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  const result = await loadWikiMaterialRaidSources('Gold Brick', { fetchImpl });
  assert.equal(result.state, 'unavailable');
  assert.match(result.limitation ?? '', /failed: 503/i);
});

test('Wiki API URL targets only the public material page parse endpoint', () => {
  const url = new URL(buildWikiMaterialApiUrl('Abyssal Wing'));
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.searchParams.get('action'), 'parse');
  assert.equal(url.searchParams.get('page'), 'Abyssal Wing');
  assert.equal(url.searchParams.get('prop'), 'wikitext|revid');
});
