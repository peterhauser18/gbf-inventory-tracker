import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { ingestAccountRecord, isVerifiedAccountResponseUrl } from './ingest.ts';

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
