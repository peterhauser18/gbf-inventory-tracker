import assert from 'node:assert/strict';
import test from 'node:test';
import { WikiImageLoader } from './wiki-image-loader.ts';

test('Wiki image fetch runs with the global receiver required by browser fetch', async () => {
  let observedReceiver: unknown;
  const fetchImpl = (async function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
    observedReceiver = this;
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    return new Response('image', { headers: { 'Content-Type': 'image/png' } });
  }) as typeof fetch;

  const loader = new WikiImageLoader({
    fetchImpl,
    cacheStorage: undefined,
    createObjectUrl: () => 'blob:receiver-safe',
    revokeObjectUrl: () => {},
  });

  const result = await loader.request('https://gbf.wiki/images/receiver.png', {
    generation: 1,
    nearViewport: true,
  });
  assert.equal(result, 'blob:receiver-safe');
  assert.equal(observedReceiver, globalThis);
});
