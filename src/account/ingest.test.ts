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
