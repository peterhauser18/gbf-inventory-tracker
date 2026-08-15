import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addRecordToSummary,
  buildCapturedResponse,
  emptyCaptureSummary,
  isCaptureCandidate,
} from './policy.ts';
import type { ObservedResponse } from './types.ts';

const observed: ObservedResponse = {
  requestId: 'request-1',
  url: 'https://game.granbluefantasy.jp/inventory/list?user_id=123&token=url-secret',
  status: 200,
  mimeType: 'application/json',
  resourceType: 'xhr',
};

test('only captures XHR/fetch responses from the GBF game origin', () => {
  assert.equal(isCaptureCandidate(observed), true);
  assert.equal(isCaptureCandidate({ ...observed, resourceType: 'document' }), false);
  assert.equal(isCaptureCandidate({ ...observed, url: 'https://example.com/inventory' }), false);
  assert.equal(isCaptureCandidate({ ...observed, url: 'http://game.granbluefantasy.jp/inventory' }), false);
});

test('stores only whitelisted response metadata and redacts credential-like JSON fields', () => {
  const inputWithForbiddenRequestMetadata = {
    ...observed,
    headers: { Authorization: 'Bearer header-secret', Cookie: 'session=header-secret' },
    postData: 'password=request-secret',
  } as ObservedResponse;

  const record = buildCapturedResponse(
    inputWithForbiddenRequestMetadata,
    JSON.stringify({
      inventory: { items: [{ id: 1 }] },
      session_token: 'body-secret',
      nested: { csrf: 'csrf-secret', safe: 'kept' },
    }),
    'scan-1',
    123,
  );

  assert.ok(record);
  assert.equal(record.meta.url, 'https://game.granbluefantasy.jp/inventory/list');
  assert.deepEqual(Object.keys(record.meta).sort(), [
    'capturedAt',
    'mimeType',
    'requestId',
    'resourceType',
    'status',
    'url',
  ]);
  assert.equal(JSON.stringify(record).includes('header-secret'), false);
  assert.equal(JSON.stringify(record).includes('request-secret'), false);
  assert.equal(JSON.stringify(record).includes('body-secret'), false);
  assert.equal(JSON.stringify(record).includes('csrf-secret'), false);
  assert.equal((record.body as Record<string, unknown>).session_token, '[redacted]');
});

test('rejects non-JSON bodies instead of persisting arbitrary page content', () => {
  assert.equal(buildCapturedResponse(observed, '<html>not json</html>', 'scan-1', 123), null);
});

test('marks candidate categories without claiming completeness', () => {
  const record = buildCapturedResponse(
    { ...observed, url: 'https://game.granbluefantasy.jp/collection/character/weapon/summon/treasure/arcarum' },
    JSON.stringify({ characters: [], weapons: [], summons: [], materials: [], evokers: [] }),
    'scan-1',
    123,
  );
  assert.ok(record);
  assert.deepEqual(record.categories, [
    'characters',
    'weapons',
    'summons',
    'treasures',
    'progression',
    'roster',
  ]);

  const summary = addRecordToSummary(emptyCaptureSummary('scan-1', 100), record);
  assert.equal(summary.responseCount, 1);
  assert.equal(summary.categories.characters, true);
  assert.equal(summary.categories.progression, true);
});
