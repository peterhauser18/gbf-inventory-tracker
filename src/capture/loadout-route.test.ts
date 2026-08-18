import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObservedResponseUrl, shouldReadObservedResponse } from './route.ts';

test('party deck is a narrowly allowlisted passive loadout response', () => {
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/party/deck'), 'loadout');
  assert.equal(shouldReadObservedResponse('https://game.granbluefantasy.jp/party/deck', 'xhr'), true);
  assert.equal(shouldReadObservedResponse('https://game.granbluefantasy.jp/party/deck', 'fetch'), true);
});

test('loadout allowlist does not broaden to other party paths, origins or resource types', () => {
  assert.equal(classifyObservedResponseUrl('https://game.granbluefantasy.jp/party/deck/edit'), null);
  assert.equal(classifyObservedResponseUrl('https://example.com/party/deck'), null);
  assert.equal(shouldReadObservedResponse('https://game.granbluefantasy.jp/party/deck', 'document'), false);
});
