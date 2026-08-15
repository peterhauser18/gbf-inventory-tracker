import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWikiApiUrl, loadWikiDropReferences } from './wiki.ts';

test('wiki lookup sends only public raid title with credentials omitted', async () => {
  let calledUrl = '';
  let calledInit: RequestInit | undefined;
  const fakeFetch: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledInit = init;
    return new Response(JSON.stringify({ parse: { revid: 42, wikitext: { '*': '| Gold Brick || Blue Chest || 0.25% || sample=12,000\n| Silver Relic || Rare' } } }), { status: 200 });
  };
  const refs = await loadWikiDropReferences('Proto Bahamut', ['Gold Brick', 'Silver Relic'], { fetchImpl: fakeFetch });
  const url = new URL(calledUrl);
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.searchParams.get('page'), 'Proto Bahamut');
  assert.equal(calledInit?.credentials, 'omit');
  assert.equal(calledInit?.referrerPolicy, 'no-referrer');
  assert.doesNotMatch(calledUrl, /scan|history|account|cookie|session|token/i);
  assert.equal(refs.get('Gold Brick')?.state, 'precise');
  assert.equal(refs.get('Gold Brick')?.ratePercent, 0.25);
  assert.equal(refs.get('Gold Brick')?.sampleSize, 12000);
  assert.equal(refs.get('Silver Relic')?.state, 'qualitative');
  assert.equal(refs.get('Silver Relic')?.ratePercent, undefined);
});

test('wiki qualitative/unavailable fallback never invents a percentage', async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({ parse: { wikitext: { '*': '| Mystery Drop || Unknown context' } } }), { status: 200 });
  const refs = await loadWikiDropReferences('Raid', ['Mystery Drop', 'Absent'], { fetchImpl: fakeFetch });
  assert.equal(refs.get('Mystery Drop')?.state, 'unavailable');
  assert.equal(refs.get('Mystery Drop')?.ratePercent, undefined);
  assert.equal(refs.get('Absent')?.ratePercent, undefined);
});

test('wiki API URL is fixed to the approved public origin', () => {
  const url = new URL(buildWikiApiUrl('Raid Name'));
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.pathname, '/api.php');
});
