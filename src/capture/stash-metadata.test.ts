import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isVerifiedWeaponStashMetadataResponseUrl,
  parseObservedWeaponStashName,
} from './stash-metadata.ts';

test('accepts only the passive GBF container content response family used by stash UI', () => {
  assert.equal(
    isVerifiedWeaponStashMetadataResponseUrl('https://game.granbluefantasy.jp/container/content/list/weapon/1'),
    true,
  );
  assert.equal(
    isVerifiedWeaponStashMetadataResponseUrl('https://game.granbluefantasy.jp/container/content/update/weapon/1'),
    false,
  );
  assert.equal(
    isVerifiedWeaponStashMetadataResponseUrl('https://example.com/container/content/list/weapon/1'),
    false,
  );
});

test('extracts only the visible stash name from encoded container HTML', () => {
  const html = '<div class="prt-container-name">Fire &amp; Friends</div><div>ignored</div>';
  assert.equal(
    parseObservedWeaponStashName({ data: encodeURIComponent(html) }),
    'Fire & Friends',
  );
  assert.equal(parseObservedWeaponStashName({ data: '<div>missing class</div>' }), undefined);
  assert.equal(parseObservedWeaponStashName({ data: '' }), undefined);
});
