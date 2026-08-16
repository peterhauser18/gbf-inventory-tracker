import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWikiTreasureImageIndexUrl,
  loadWikiTreasureImageIndex,
} from './wiki-treasure-images.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function revision(content: string) {
  return [{ slots: { main: { content } } }];
}

test('treasure image metadata uses one fixed account-independent Category:Items generator query', () => {
  const url = new URL(buildWikiTreasureImageIndexUrl());
  assert.equal(url.origin, 'https://gbf.wiki');
  assert.equal(url.pathname, '/api.php');
  assert.equal(url.searchParams.get('generator'), 'categorymembers');
  assert.equal(url.searchParams.get('gcmtitle'), 'Category:Items');
  assert.equal(url.searchParams.get('gcmtype'), 'page');
  assert.equal(url.searchParams.get('prop'), 'pageimages|images|revisions');
  assert.equal(url.searchParams.get('rvprop'), 'content');
  assert.equal(url.searchParams.get('rvslots'), 'main');
  assert.equal(url.searchParams.has('titles'), false);
  assert.equal(url.searchParams.has('where'), false);
  assert.equal(url.searchParams.has('ids'), false);
});

test('treasure image index resolves direct and grouped item-template image metadata without owned-ID queries', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    const continued = url.searchParams.has('gcmcontinue');
    return {
      ok: true,
      status: 200,
      json: async () => continued ? ({
        query: { pages: [
          { title: 'Satin Feather', revisions: revision('{{Item\n|name=Satin Feather\n|image=Satin_Feather.jpg\n}}') },
          { title: 'Blistering Ore', revisions: revision('{{Item|name=Blistering Ore|id=15}}') },
          {
            title: 'Low Orb',
            revisions: revision([
              '{{Item|name=Red Orb|id=101}}',
              '{{Item|name=Blue Orb|image=Blue_Orb.png}}',
            ].join('\n')),
          },
          { title: 'Unsafe Item', thumbnail: { source: 'https://game.granbluefantasy.jp/assets/item.png' } },
        ] },
      }) : ({
        continue: { gcmcontinue: 'page|next', continue: '-||' },
        query: { pages: [
          {
            title: 'Harp Stone',
            images: [
              { title: 'File:Harp_Stone.jpg' },
              { title: 'File:Item_article_s_20.jpg' },
            ],
          },
          { title: 'Gold Brick', thumbnail: { source: 'https://gbf.wiki/images/Item_article_s_10.jpg' } },
        ] },
      }),
    };
  };

  const result = await loadWikiTreasureImageIndex({ fetchImpl, now: 10 });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.searchParams.get('gcmtitle'), 'Category:Items');
    assert.equal(call.url.searchParams.has('titles'), false);
    assert.equal(call.url.searchParams.has('ids'), false);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }

  assert.equal(result.get('harp stone'), 'https://gbf.wiki/Special:Redirect/file/Item_article_s_20.jpg');
  assert.equal(result.get('treasure 20'), result.get('harp stone'));
  assert.equal(result.get('gold brick'), 'https://gbf.wiki/images/Item_article_s_10.jpg');
  assert.equal(result.get('satin feather'), 'https://gbf.wiki/Special:Redirect/file/Satin_Feather.jpg');
  assert.equal(result.get('blistering ore'), 'https://gbf.wiki/Special:Redirect/file/Item_article_s_15.jpg');
  assert.equal(result.get('red orb'), 'https://gbf.wiki/Special:Redirect/file/Item_article_s_101.jpg');
  assert.equal(result.get('blue orb'), 'https://gbf.wiki/Special:Redirect/file/Blue_Orb.png');
  assert.equal(result.has('unsafe item'), false);
});

test('fresh v4 treasure metadata cache avoids a second public Wiki query', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        query: { pages: [
          { title: 'Satin Feather', revisions: revision('{{Item|name=Satin Feather|image=Satin_Feather.jpg}}') },
        ] },
      }),
    };
  };

  const first = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 10 });
  const second = await loadWikiTreasureImageIndex({ fetchImpl, storage, now: 20 });
  assert.equal(calls, 1);
  assert.equal(second.get('satin feather'), first.get('satin feather'));
});
