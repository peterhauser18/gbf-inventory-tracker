import assert from 'node:assert/strict';
import test from 'node:test';
import {
  installPassivePageObserver,
  isVerifiedPassiveAccountUrl,
  isVerifiedPassiveCombatUrl,
  isVerifiedPassiveResponseUrl,
  wrapFetch,
  type PassiveAccountResponse,
} from './page-observer.ts';

test('passive URL policy accepts only verified account and combat response families', () => {
  assert.equal(isVerifiedPassiveAccountUrl('https://game.granbluefantasy.jp/npc/list/2?x=secret'), true);
  assert.equal(isVerifiedPassiveAccountUrl('https://game.granbluefantasy.jp/item/article_list_by_filter_mode'), true);

  const combatUrls = [
    '/rest/multiraid/start.json',
    '/rest/multiraid/normal_attack_result.json',
    '/rest/multiraid/ability_result.json',
    '/rest/multiraid/summon_result.json',
    '/rest/multiraid/temporary_item_result.json',
    '/rest/multiraid/multi_member_info',
    '/resultmulti/content/index/raid-instance-123',
  ];
  for (const path of combatUrls) {
    const url = `https://game.granbluefantasy.jp${path}?secret=ignored`;
    assert.equal(isVerifiedPassiveCombatUrl(url), true, path);
    assert.equal(isVerifiedPassiveResponseUrl(url), true, path);
    assert.equal(isVerifiedPassiveAccountUrl(url), false, path);
  }

  assert.equal(isVerifiedPassiveResponseUrl('https://game.granbluefantasy.jp/rest/multiraid/unverified.json'), false);
  assert.equal(isVerifiedPassiveResponseUrl('https://game.granbluefantasy.jp/quest/start'), false);
  assert.equal(isVerifiedPassiveResponseUrl('https://example.com/rest/multiraid/start.json'), false);
});

test('fetch wrapper observes verified combat without issuing an additional request', async () => {
  let calls = 0;
  const observed: PassiveAccountResponse[] = [];
  const response = new Response(JSON.stringify({ scenario: [{ cmd: 'attack' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', {
    value: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json?ignored=1',
  });
  const originalPromise = Promise.resolve(response);
  const nativeFetch = (() => {
    calls += 1;
    return originalPromise;
  }) as typeof fetch;
  const wrapped = wrapFetch(nativeFetch, (value) => observed.push(value));

  const returned = wrapped('https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json');
  assert.equal(returned, originalPromise);
  await returned;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls, 1);
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.url, 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json');
  assert.equal(observed[0]?.resourceType, 'fetch');
  assert.match(observed[0]?.body ?? '', /attack/);
});

test('XHR wrapper observes verified combat after the page-initiated request completes once', () => {
  let calls = 0;
  const observed: PassiveAccountResponse[] = [];

  class FakeXhr {
    responseURL = 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json?ignored=1';
    responseType = 'text';
    responseText = JSON.stringify({ scenario: [{ cmd: 'ability' }] });
    response: unknown = this.responseText;
    status = 200;
    private listener?: () => void;

    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      if (type !== 'loadend') return;
      this.listener = typeof listener === 'function'
        ? () => listener({} as Event)
        : () => listener.handleEvent({} as Event);
    }

    getResponseHeader(name: string): string | null {
      return name.toLowerCase() === 'content-type' ? 'application/json' : null;
    }

    send(): void {
      calls += 1;
      this.listener?.();
    }
  }

  const host = {
    fetch: (() => Promise.reject(new Error('unused'))) as typeof fetch,
    XMLHttpRequest: FakeXhr,
  } as unknown as Window & typeof globalThis;

  installPassivePageObserver(host, (value) => observed.push(value));
  const xhr = new host.XMLHttpRequest();
  xhr.send();

  assert.equal(calls, 1);
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.url, 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json');
  assert.equal(observed[0]?.resourceType, 'xhr');
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
