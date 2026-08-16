import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  accountEvidenceForVerifiedResponseUrl,
  ingestAccountRecord,
  isVerifiedAccountResponseUrl,
} from './ingest.ts';

function record(path: string, body: unknown, capturedAt = 100): CapturedResponseRecord {
  return {
    id: `passive:${capturedAt}`,
    scanId: 'passive-account',
    meta: {
      requestId: String(capturedAt),
      url: `https://game.granbluefantasy.jp${path}`,
      resourceType: 'fetch',
      capturedAt,
    },
    body,
    categories: [],
  };
}

function rosterPage(level: number): unknown {
  return {
    list: [{ param: { id: '1', level, evolution: 4 }, master: { id: '3040030000' } }],
    first: 1,
    last: 2,
    prev: 0,
    next: 2,
    count: 2,
    current: 1,
    options: { number: 2 },
  };
}

test('verified account response families can update the cumulative database', () => {
  const next = ingestAccountRecord(null, record('/user/status', { status: { level: 350 } }));
  assert.ok(next);
  assert.equal(next.snapshot.accountStatus?.rank, 350);
  assert.equal(next.snapshot.quality.accountStatus, 'known');
  assert.equal(next.observedAt.accountStatus, 100);
});

test('unknown or gameplay endpoint families cannot update the account database', () => {
  assert.equal(isVerifiedAccountResponseUrl('https://game.granbluefantasy.jp/quest/start'), false);
  assert.equal(ingestAccountRecord(null, record('/quest/start', { result: 'ok' })), null);
});

test('malformed payloads on a verified path do not become account facts', () => {
  assert.equal(ingestAccountRecord(null, record('/npc/list/1', { list: 'not-an-array' })), null);
});

test('verified paths expose only the affected account evidence family', () => {
  assert.equal(accountEvidenceForVerifiedResponseUrl('https://game.granbluefantasy.jp/user/status'), 'accountStatus');
  assert.equal(accountEvidenceForVerifiedResponseUrl('https://game.granbluefantasy.jp/item/article_list_by_filter_mode'), 'treasures');
  assert.equal(accountEvidenceForVerifiedResponseUrl('https://game.granbluefantasy.jp/npc/list/1'), 'characters');
  assert.equal(accountEvidenceForVerifiedResponseUrl('https://game.granbluefantasy.jp/weapon/container_list/1/2'), 'weaponStashes');
  assert.equal(accountEvidenceForVerifiedResponseUrl('https://game.granbluefantasy.jp/quest/start'), null);
});

test('identical complete Treasure observations do not rewrite the cumulative database', () => {
  const path = '/item/article_list_by_filter_mode';
  const first = ingestAccountRecord(null, record(path, [
    { item_id: '1', name: 'A', number: 5 },
    { item_id: '2', name: 'B', number: 0 },
  ], 100));
  assert.ok(first);

  const duplicate = ingestAccountRecord(first, record(path, [
    { item_id: '1', name: 'A', number: 5 },
    { item_id: '2', name: 'B', number: 0 },
  ], 200));
  assert.equal(duplicate, first);
  assert.equal(duplicate.observedAt.treasures, 100);

  const changed = ingestAccountRecord(first, record(path, [
    { item_id: '1', name: 'A', number: 4 },
    { item_id: '2', name: 'B', number: 0 },
  ], 300));
  assert.ok(changed);
  assert.notEqual(changed, first);
  assert.equal(changed.snapshot.treasures.find((item) => item.itemId === '1')?.quantity, 4);
  assert.equal(changed.observedAt.treasures, 300);
});

test('identical account status does not rewrite only because capture time changed', () => {
  const first = ingestAccountRecord(null, record('/user/status', { status: { level: 395 } }, 100));
  assert.ok(first);

  const duplicate = ingestAccountRecord(first, record('/user/status', { status: { level: 395 } }, 200));
  assert.equal(duplicate, first);
  assert.equal(duplicate.observedAt.accountStatus, 100);

  const changed = ingestAccountRecord(first, record('/user/status', { status: { level: 396 } }, 300));
  assert.ok(changed);
  assert.notEqual(changed, first);
  assert.equal(changed.snapshot.accountStatus?.rank, 396);
});

test('identical partial roster page does not rewrite while a changed value still does', () => {
  const path = '/npc/list/1';
  const first = ingestAccountRecord(null, record(path, rosterPage(80), 100));
  assert.ok(first);
  assert.equal(first.snapshot.quality.characters, 'partial');

  const duplicate = ingestAccountRecord(first, record(path, rosterPage(80), 200));
  assert.equal(duplicate, first);

  const changed = ingestAccountRecord(first, record(path, rosterPage(81), 300));
  assert.ok(changed);
  assert.notEqual(changed, first);
  assert.equal(changed.snapshot.characters[0]?.level, 81);
});
