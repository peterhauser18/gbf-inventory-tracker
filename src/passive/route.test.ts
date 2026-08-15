import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPassiveResponseUrl } from './route.ts';

test('automatic passive routing keeps account and verified combat families separated', () => {
  assert.equal(classifyPassiveResponseUrl('https://game.granbluefantasy.jp/user/status'), 'account');
  assert.equal(classifyPassiveResponseUrl('https://game.granbluefantasy.jp/npc/list/1'), 'account');

  const combatPaths = [
    '/rest/multiraid/start.json',
    '/rest/multiraid/normal_attack_result.json',
    '/rest/multiraid/ability_result.json',
    '/rest/multiraid/summon_result.json',
    '/rest/multiraid/temporary_item_result.json',
    '/rest/multiraid/multi_member_info',
    '/resultmulti/content/index/raid-instance-123',
  ];
  for (const path of combatPaths) {
    assert.equal(classifyPassiveResponseUrl(`https://game.granbluefantasy.jp${path}`), 'combat', path);
  }

  assert.equal(classifyPassiveResponseUrl('https://game.granbluefantasy.jp/rest/multiraid/unverified.json'), null);
  assert.equal(classifyPassiveResponseUrl('https://game.granbluefantasy.jp/quest/start'), null);
  assert.equal(classifyPassiveResponseUrl('https://example.com/rest/multiraid/start.json'), null);
});
