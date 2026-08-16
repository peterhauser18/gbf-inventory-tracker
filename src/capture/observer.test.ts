import assert from 'node:assert/strict';
import test from 'node:test';
import { processObservedResponse } from './observer.ts';
import type { ObservedResponse } from './types.ts';

const meta: ObservedResponse = {
  requestId: 'request-1',
  url: 'https://game.granbluefantasy.jp/weapon/list/1',
  resourceType: 'fetch',
  status: 200,
  mimeType: 'application/json',
};

test('debugger observer reads an already-received allowlisted response body and stores it', async () => {
  const calls: string[] = [];
  const saved: unknown[] = [];

  const result = await processObservedResponse(
    meta,
    'scan-1',
    {
      getResponseBody: async (requestId) => {
        calls.push(`getResponseBody:${requestId}`);
        return { body: JSON.stringify({ weapons: [{ id: 'w1' }] }) };
      },
    },
    async (record) => {
      calls.push('save');
      saved.push(record);
    },
    123,
  );

  assert.ok(result);
  assert.deepEqual(calls, ['getResponseBody:request-1', 'save']);
  assert.equal(saved.length, 1);
});

test('non-GBF responses are rejected before any response-body read', async () => {
  let bodyReads = 0;
  const result = await processObservedResponse(
    { ...meta, url: 'https://example.com/weapon/list/1' },
    'scan-1',
    {
      getResponseBody: async () => {
        bodyReads += 1;
        return { body: '{}' };
      },
    },
    async () => {},
  );

  assert.equal(result, null);
  assert.equal(bodyReads, 0);
});

test('unknown GBF endpoints are rejected before any response-body read', async () => {
  let bodyReads = 0;
  const result = await processObservedResponse(
    { ...meta, url: 'https://game.granbluefantasy.jp/quest/start' },
    'scan-1',
    {
      getResponseBody: async () => {
        bodyReads += 1;
        return { body: '{}' };
      },
    },
    async () => {},
  );

  assert.equal(result, null);
  assert.equal(bodyReads, 0);
});

test('base64-encoded JSON response bodies are decoded locally', async () => {
  const body = JSON.stringify({ summons: [{ id: 's1' }] });
  const encoded = Buffer.from(body, 'utf8').toString('base64');
  const result = await processObservedResponse(
    { ...meta, requestId: 'request-2', url: 'https://game.granbluefantasy.jp/summon/list/1' },
    'scan-1',
    { getResponseBody: async () => ({ body: encoded, base64Encoded: true }) },
    async () => {},
    123,
  );

  assert.ok(result);
  assert.deepEqual(result.body, { summons: [{ id: 's1' }] });
});
