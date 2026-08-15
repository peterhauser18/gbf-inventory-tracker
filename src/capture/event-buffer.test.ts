import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureEventBuffer } from './event-buffer.ts';
import type { ObservedResponse } from './types.ts';

const gbfResponse: ObservedResponse = {
  requestId: 'request-1',
  url: 'https://game.granbluefantasy.jp/inventory/list',
  resourceType: 'xhr',
};

test('buffers only qualifying GBF responses until loading is finished', () => {
  const buffer = new CaptureEventBuffer();
  assert.equal(buffer.remember(gbfResponse), true);
  assert.equal(buffer.remember({ ...gbfResponse, requestId: 'other', url: 'https://example.com/' }), false);

  assert.deepEqual(buffer.take('request-1'), gbfResponse);
  assert.equal(buffer.take('request-1'), null);
  assert.equal(buffer.take('other'), null);
});

test('failed or stopped requests can be discarded without a body read', () => {
  const buffer = new CaptureEventBuffer();
  buffer.remember(gbfResponse);
  buffer.forget('request-1');
  assert.equal(buffer.take('request-1'), null);

  buffer.remember(gbfResponse);
  buffer.clear();
  assert.equal(buffer.take('request-1'), null);
});
