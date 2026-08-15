import assert from 'node:assert/strict';
import test from 'node:test';
import { isVerifiedPassiveAccountUrl, wrapFetch, type PassiveAccountResponse } from './page-observer.ts';

test('passive URL policy accepts only already-verified GBF account response families', () => {
  assert.equal(isVerifiedPassiveAccountUrl('https://game.granbluefantasy.jp/npc/list/2?x=secret'), true);
  assert.equal(isVerifiedPassiveAccountUrl('https://game.granbluefantasy.jp/item/article_list_by_filter_mode'), true);
  assert.equal(isVerifiedPassiveAccountUrl('https://game.granbluefantasy.jp/quest/start'), false);
  assert.equal(isVerifiedPassiveAccountUrl('https://example.com/npc/list/1'), false);
});

test('fetch wrapper observes the page request without issuing an additional request', async () => {
  let calls = 0;
  const observed: PassiveAccountResponse[] = [];
  const response = new Response(JSON.stringify({ status: { level: 350 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', {
    value: 'https://game.granbluefantasy.jp/user/status?ignored=1',
  });
  const originalPromise = Promise.resolve(response);
  const nativeFetch = (() => {
    calls += 1;
    return originalPromise;
  }) as typeof fetch;
  const wrapped = wrapFetch(nativeFetch, (value) => observed.push(value));

  const returned = wrapped('https://game.granbluefantasy.jp/user/status');
  assert.equal(returned, originalPromise);
  await returned;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 1);
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.url, 'https://game.granbluefantasy.jp/user/status');
  assert.match(observed[0]?.body ?? '', /350/);
});

test('unknown fetch responses are ignored without reading or emitting their bodies', async () => {
  let calls = 0;
  let emitted = 0;
  const response = new Response('danger', { status: 200 });
  Object.defineProperty(response, 'url', {
    value: 'https://game.granbluefantasy.jp/quest/start',
  });
  const nativeFetch = (() => {
    calls += 1;
    return Promise.resolve(response);
  }) as typeof fetch;
  const wrapped = wrapFetch(nativeFetch, () => { emitted += 1; });

  await wrapped('https://game.granbluefantasy.jp/quest/start');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 1);
  assert.equal(emitted, 0);
});
