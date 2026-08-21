import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyObservedResponseUrl, shouldReadObservedResponse } from './route.ts';

test('debugger capture accepts only verified GBF account, stash metadata and combat response families', () => {
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/npc/list/2?ignored=1'), 'account');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/npc/list/999'), 'account');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/weapon/container_list/7/stash'), 'account');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/container/content/list/weapon/1'), 'stash-meta');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json'), 'combat');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/resultmulti/content/index/run-123'), 'combat');
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/rest/multiraid/unknown_result.json'), null);
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/container/content/update/weapon/1'), null);
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/profile/content/index'), null);
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/quest/start'), null);
  assert.equal(classifyObservedResponseUrl('https://example.com/npc/list/2'), null);
});

test('response bodies are eligible only for allowlisted XHR/fetch responses', () => {
  const accountUrl = 'https://game.granbluefantasy.jp/item/article_list_by_filter_mode';
  const stashMetaUrl = 'https://game.granbluefantasy.jp/container/content/list/weapon/1';
  assert.equal(shouldReadObservedResponse(accountUrl, 'xhr'), true);
  assert.equal(shouldReadObservedResponse(accountUrl, 'fetch'), true);
  assert.equal(shouldReadObservedResponse(stashMetaUrl, 'xhr'), true);
  assert.equal(shouldReadObservedResponse(stashMetaUrl, 'document'), false);
  assert.equal(shouldReadObservedResponse(accountUrl, 'document'), false);
  assert.equal(shouldReadObservedResponse(accountUrl, 'other'), false);
  assert.equal(shouldReadObservedResponse('https://game.granbluefantasy.jp/quest/start', 'fetch'), false);
});
