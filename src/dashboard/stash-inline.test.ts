import assert from 'node:assert/strict';
import test from 'node:test';
import type { DashboardCard } from './model.ts';
import { renderInlineStashCollection, selectInlineStashes } from './stash-inline.ts';

function weapon(key: string, title: string, masterId: string, imageUrl?: string): DashboardCard {
  return {
    key,
    kind: 'weapon',
    title,
    subtitle: 'Lv 150 · Skill 15 · Uncap 4',
    quality: 'known',
    wikiUrl: `https://gbf.wiki/${encodeURIComponent(title)}`,
    imageUrl,
    detailFields: [
      { label: 'Stash ID', value: key.split(':')[1] ?? 'unknown' },
      { label: 'Master ID', value: masterId },
    ],
  };
}

function stash(id: string, children: DashboardCard[]): DashboardCard {
  return {
    key: `stash:${id}`,
    kind: 'stash',
    title: 'Weapon Stash',
    subtitle: `${children.length} observed weapons`,
    quality: 'known',
    wikiUrl: 'https://gbf.wiki/Weapon_Stash',
    detailFields: [{ label: 'Stash ID', value: id }],
    children,
  };
}

const stashA = stash('1', [
  weapon('stash-weapon:1:a', 'Higurashi', '1040001111', 'data:image/gif;base64,AAAA#gbfit-wiki=https%3A%2F%2Fgbf.wiki%2Fimages%2Fhigurashi.png'),
  weapon('stash-weapon:1:b', 'Dark Opus', '1040002222'),
]);
const stashB = stash('2', [weapon('stash-weapon:2:c', 'Ultima Sword', '1040003333')]);

test('each stash expands independently and collapsed children are not rendered', () => {
  const rows = selectInlineStashes([stashA, stashB], '', new Set(['stash:2']));
  assert.equal(rows[0]?.expanded, false);
  assert.equal(rows[1]?.expanded, true);

  const html = renderInlineStashCollection([stashA, stashB], '', new Set(['stash:2']));
  assert.doesNotMatch(html, /stash-weapon:1:a/);
  assert.match(html, /stash-weapon:2:c/);
});

test('child search surfaces the owning stash and only matching child rows', () => {
  const rows = selectInlineStashes([stashA, stashB], 'Higu', new Set());
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.stash.key, 'stash:1');
  assert.equal(rows[0]?.expanded, true);
  assert.equal(rows[0]?.forcedByChildMatch, true);
  assert.deepEqual(rows[0]?.visibleChildren.map((child) => child.key), ['stash-weapon:1:a']);
});

test('matching a stash keeps it visible without forcing expansion', () => {
  const rows = selectInlineStashes([stashA, stashB], 'stash:2', new Set());
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.stash.key, 'stash:2');
  assert.equal(rows[0]?.expanded, false);
});

test('expanded child cards retain provenance and open through existing detail keys', () => {
  const html = renderInlineStashCollection([stashA], '', new Set(['stash:1']));
  assert.match(html, /data-stash-parent="stash:1"/);
  assert.match(html, /data-stash-child="stash-weapon:1:a"/);
  assert.match(html, /data-detail="stash-weapon:1:a"/);
  assert.match(html, /In this stash/);
  assert.match(html, /Wiki ↗/);
});

test('collapsed stash markup contains no child image target while expansion makes it eligible', () => {
  const collapsed = renderInlineStashCollection([stashA], '', new Set());
  assert.doesNotMatch(collapsed, /higurashi\.png/);
  assert.doesNotMatch(collapsed, /data-entity-image/);

  const expanded = renderInlineStashCollection([stashA], '', new Set(['stash:1']));
  assert.match(expanded, /higurashi\.png/);
  assert.match(expanded, /data-entity-image/);
});
