import assert from 'node:assert/strict';
import test from 'node:test';
import { findTreasureQuantity, normalizeCaptureScan } from './normalize.ts';
import type { CapturedResponseRecord } from './types.ts';

function record(url: string, body: unknown, capturedAt = 10, requestId = String(capturedAt)): CapturedResponseRecord {
  return {
    id: `scan:${requestId}`,
    scanId: 'scan',
    meta: { requestId, url, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function page(
  list: unknown[],
  current: number,
  last: number,
  total = list.length * last,
  held = total,
  filter?: Record<string, unknown>,
) {
  return {
    list,
    first: 1,
    last,
    prev: current - 1,
    next: current < last ? current + 1 : 0,
    count: total,
    current,
    options: { number: held, ...(filter ? { filter } : {}) },
  };
}

const character = (id: number, masterId: string, level = '80') => ({
  param: { id, level, evolution: '4', arousal_level: 7 },
  master: { id: masterId },
});
const weapon = (id: number, masterId: string, level = '1') => ({
  param: { id, level, evolution: '2', skill_level: '15', arousal: { level: 5 } },
  master: { id: masterId },
});
const summon = (id: number, masterId: number) => ({
  param: { id, level: '100', evolution: '3' },
  master: { id: masterId },
});
const artifact = (id: number, masterId: number) => ({
  id, artifact_id: masterId, name: 'Fixture Artifact', level: '3', kind: '1', attribute: '4',
});

test('normalizes all supported families in one pass without inventing progression', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/npc/list/1', page([character(11, '3001')], 1, 1), 11),
    record('https://game.granbluefantasy.jp/weapon/list/1', page([weapon(21, '1001')], 1, 1), 12),
    record('https://game.granbluefantasy.jp/summon/list/1', page([summon(31, 2001)], 1, 1), 13),
    record('https://game.granbluefantasy.jp/rest/artifact/list/1', page([artifact(41, 301)], 1, 1), 14),
    record('https://game.granbluefantasy.jp/item/article_list_by_filter_mode', [
      { item_id: '501', name: 'Fixture Treasure', number: '9' },
      { item_id: '502', name: 'Known Zero', number: '0' },
    ], 15),
    record('https://game.granbluefantasy.jp/item/recovery_and_evolution_list_by_filter_mode', {
      '0': [{ item_id: '1', name: 'Fixture Recovery', number: '4' }],
      '1': [[{ item_id: '1', item_kind_id: 17, name: 'Fixture Uncap', number: 2 }]],
    }, 16),
    record('https://game.granbluefantasy.jp/item/gacha_ticket_and_others_list_by_filter_mode', [
      [{ item_id: '1', name: 'Fixture Ticket', number: '0' }],
      [{ item_kind: 55, item_id: '1', name: 'Fixture Other', number: '3' }],
    ], 16.5, 'tickets'),
    record('https://game.granbluefantasy.jp/weapon/container_list/1/stash-a', page(
      [weapon(51, '1002')], 1, 1, 1, 1, { '5': '00110', '6': '000000' },
    ), 16.7, 'stash'),
    record('https://game.granbluefantasy.jp/user/status', { status: { level: '350' } }, 17),
    record('https://game.granbluefantasy.jp/listall/content/index', { data: 'Eternals Evokers progression template text' }, 18),
  ]);

  assert.equal(snapshot.characters[0]?.masterId, '3001');
  assert.equal(snapshot.characters[0]?.awakeningLevel, 7);
  assert.equal(snapshot.weapons[0]?.skillLevel, 15);
  assert.equal(snapshot.summons[0]?.uncap, 3);
  assert.equal(snapshot.artifacts[0]?.attributeId, '4');
  assert.equal(snapshot.accountStatus?.rank, 350);
  assert.deepEqual(snapshot.progression, []);
  assert.equal(snapshot.quality.progression, 'unknown');
  assert.deepEqual(findTreasureQuantity(snapshot, '502'), { state: 'known', quantity: 0 });
  assert.deepEqual(findTreasureQuantity(snapshot, 'missing'), { state: 'unknown' });
  assert.equal(snapshot.consumables.length, 2, 'same item_id in different consumable groups must not collide');
  assert.equal(snapshot.tickets.length, 2, 'same item_id in ticket/other groups must not collide');
  assert.equal(snapshot.tickets.find((item) => item.group === 'tickets')?.quantity, 0);
  assert.equal(snapshot.quality.tickets, 'known');
  assert.equal(snapshot.weaponStashes[0]?.stashId, 'stash-a');
  assert.equal(snapshot.weaponStashes[0]?.quality, 'known');
});

test('reports paginated families partial until every advertised page is observed', () => {
  const partial = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/npc/list/1', page([character(1, '3001')], 1, 2), 10),
  ]);
  assert.equal(partial.quality.characters, 'partial');

  const complete = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/npc/list/1', page(
      [character(1, '3001')], 1, 2, 2, 2, { '5': '11110', '6': '000000' },
    ), 10),
    record('https://game.granbluefantasy.jp/npc/list/2', page(
      [character(2, '3002')], 2, 2, 2, 2, { '5': '11110', '6': '000000' },
    ), 11),
  ]);
  assert.equal(complete.quality.characters, 'known');
  assert.equal(complete.characters.length, 2);
});

test('keeps a fully paged but filtered roster view partial', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/summon/list/1', page([summon(1, 2001)], 1, 2, 2, 5), 10),
    record('https://game.granbluefantasy.jp/summon/list/2', page([summon(2, 2002)], 2, 2, 2, 5), 11),
  ]);
  assert.equal(snapshot.summons.length, 2);
  assert.equal(snapshot.quality.summons, 'partial');
});

test('keeps roster coverage partial when filter metadata is missing', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/npc/list/1', page([character(1, '3001')], 1, 1)),
  ]);
  assert.equal(snapshot.characters.length, 1);
  assert.equal(snapshot.quality.characters, 'partial');
});

test('keeps an equal-count primary roster view partial when selector filters are active', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/npc/list/1', page(
      [character(1, '3001')], 1, 1, 1, 1, { '5': '00010', '6': '000000' },
    )),
  ]);
  assert.equal(snapshot.characters.length, 1);
  assert.equal(snapshot.quality.characters, 'partial');
});

test('normalizes weapon stashes separately and uses the newest page coverage', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/weapon/container_list/1/stash-a', page(
      [weapon(51, '1002', '1')], 1, 1, 1, 4, { '5': '00110', '6': '010000' },
    ), 10, 'filtered'),
    record('https://game.granbluefantasy.jp/weapon/container_list/1/stash-a', page(
      [weapon(51, '1002', '20')], 1, 2, 2, 2, { '5': '00110', '6': '000000' },
    ), 20, 'full-1'),
    record('https://game.granbluefantasy.jp/weapon/container_list/2/stash-a', page(
      [weapon(52, '1003', '10')], 2, 2, 2, 2, { '5': '00110', '6': '000000' },
    ), 21, 'full-2'),
    record('https://game.granbluefantasy.jp/weapon/container_list/1/stash-b', page(
      [weapon(61, '1010')], 1, 2, 2, 2, { '5': '00110', '6': '000000' },
    ), 22, 'other-partial'),
  ]);

  assert.equal(snapshot.weaponStashes.length, 2);
  const stashA = snapshot.weaponStashes.find((stash) => stash.stashId === 'stash-a');
  const stashB = snapshot.weaponStashes.find((stash) => stash.stashId === 'stash-b');
  assert.equal(stashA?.quality, 'known');
  assert.equal(stashA?.weapons.length, 2);
  assert.equal(stashA?.weapons.find((item) => item.id === '51')?.level, 20);
  assert.equal(stashB?.quality, 'partial');
});

test('deduplicates repeated instance observations using the newest captured record', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/weapon/list/1', page([weapon(21, '1001', '1')], 1, 1), 10, 'old'),
    record('https://game.granbluefantasy.jp/weapon/list/1', page([weapon(21, '1001', '20')], 1, 1), 20, 'new'),
  ]);
  assert.equal(snapshot.weapons.length, 1);
  assert.equal(snapshot.weapons[0]?.level, 20);
  assert.equal(snapshot.weapons[0]?.updatedAt, 20);
});

test('keeps missing or malformed fields unknown instead of manufacturing values', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/weapon/list/1', page([
      { param: { id: 21, level: 'not-a-number', skill_level: 'SP' }, master: { id: '1001' } },
    ], 1, 1)),
  ]);
  assert.equal(snapshot.weapons[0]?.level, undefined);
  assert.equal(snapshot.weapons[0]?.skillLevel, undefined);
  assert.equal(snapshot.quality.treasures, 'unknown');
  assert.deepEqual(findTreasureQuantity(snapshot, '501'), { state: 'unknown' });
});

test('does not parse template/content payloads as roster or progression truth', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/listall/content/index', { data: '<div>weapon summon Eternals Evokers</div>' }),
    record('https://game.granbluefantasy.jp/item/content/index', { display_list: ['items'] }),
  ]);
  assert.equal(snapshot.quality.characters, 'unknown');
  assert.equal(snapshot.quality.weapons, 'unknown');
  assert.equal(snapshot.quality.summons, 'unknown');
  assert.equal(snapshot.quality.progression, 'unknown');
  assert.deepEqual(snapshot.progression, []);
});


test('marks malformed observed inventory rows partial instead of treating them as known', () => {
  const snapshot = normalizeCaptureScan([
    record('https://game.granbluefantasy.jp/item/article_list_by_filter_mode', [
      { item_id: '501', number: '3' },
      { item_id: 'broken' },
    ]),
    record('https://game.granbluefantasy.jp/item/recovery_and_evolution_list_by_filter_mode', {
      '0': [{ item_id: '1', number: '2' }, { item_id: '2' }],
    }),
    record('https://game.granbluefantasy.jp/item/gacha_ticket_and_others_list_by_filter_mode', [
      [{ item_id: '1', number: '2' }, { item_id: '2' }],
      [],
    ]),
  ]);
  assert.equal(snapshot.quality.treasures, 'partial');
  assert.equal(snapshot.quality.consumables, 'partial');
  assert.equal(snapshot.quality.tickets, 'partial');
});

test('normalization is pure and does not touch network or browser storage', () => {
  const originalFetch = globalThis.fetch;
  const originalIndexedDb = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => { throw new Error('network access is not allowed'); },
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: new Proxy({}, { get: () => { throw new Error('storage access is not allowed'); } }),
  });
  try {
    const snapshot = normalizeCaptureScan([
      record('https://game.granbluefantasy.jp/item/article_list_by_filter_mode', [
        { item_id: '501', number: '3' },
      ]),
    ]);
    assert.deepEqual(findTreasureQuantity(snapshot, '501'), { state: 'known', quantity: 3 });
  } finally {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
  }
});
