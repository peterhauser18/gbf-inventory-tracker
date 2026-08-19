import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObservedLoadout } from './loadout-read.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';

const NPCS = ['3040000001', '3040000002', '3040000003', '3040000004', '3040000005'];
const SUMMONS = ['2040000001', '2040000002', '2040000003', '2040000004', '2040000005'];

function snapshot(options: {
  mainWeaponId: string;
  deckId?: string;
  weaponGridQuality?: 'unknown' | 'partial' | 'known';
  weaponCount?: number;
  summonIds?: string[];
}): RaidLoadoutSnapshot {
  const weaponGridQuality = options.weaponGridQuality ?? 'unknown';
  const weaponCount = options.weaponCount ?? (weaponGridQuality === 'known' ? 10 : 0);
  return {
    quality: weaponGridQuality === 'known' ? 'known' : 'partial',
    observedAt: 1000,
    updatedAt: 1000,
    correlation: options.deckId ? 'signature' : 'battle-start',
    deckId: options.deckId,
    signature: {
      npcIds: [...NPCS],
      summonIds: [...(options.summonIds ?? SUMMONS)],
      mainWeaponId: options.mainWeaponId,
    },
    partyQuality: 'known',
    party: [],
    summonQuality: 'known',
    summons: [],
    mainWeaponId: options.mainWeaponId,
    jobId: '140401',
    weaponGridQuality,
    weapons: Array.from({ length: weaponCount }, (_, index) => ({
      slot: index + 1,
      masterId: String(1040000001 + index),
      name: `Weapon ${index + 1}`,
    })),
    additionalWeaponsActive: weaponCount > 10,
    calculator: { quality: 'unknown', enhancement: {}, boosts: [] },
  };
}

test('live loadout read tolerates a main-weapon skin mismatch when party and own summons uniquely match', () => {
  const raid = snapshot({ mainWeaponId: 'skin-weapon', weaponGridQuality: 'unknown' });
  const observedDeck = snapshot({ mainWeaponId: '1040000001', deckId: '84', weaponGridQuality: 'known' });

  const resolved = resolveObservedLoadout(raid, [observedDeck]);

  assert.ok(resolved);
  assert.equal(resolved.weaponGridQuality, 'known');
  assert.equal(resolved.weapons.length, 10);
  assert.equal(resolved.deckId, '84');
  assert.equal(resolved.mainWeaponId, 'skin-weapon');
});

test('skin-tolerant fallback fails closed when the same party and summons match more than one deck', () => {
  const raid = snapshot({ mainWeaponId: 'skin-weapon', weaponGridQuality: 'unknown' });
  const first = snapshot({ mainWeaponId: '1040000001', deckId: '84', weaponGridQuality: 'known' });
  const second = snapshot({ mainWeaponId: '1040000999', deckId: '85', weaponGridQuality: 'known' });

  const resolved = resolveObservedLoadout(raid, [first, second]);

  assert.equal(resolved, raid);
  assert.equal(resolved?.weaponGridQuality, 'unknown');
});

test('skin-tolerant fallback still requires all five own summons to match', () => {
  const raid = snapshot({ mainWeaponId: 'skin-weapon', weaponGridQuality: 'unknown' });
  const changedSummons = [...SUMMONS];
  changedSummons[4] = 'different';
  const observedDeck = snapshot({
    mainWeaponId: '1040000001',
    deckId: '84',
    weaponGridQuality: 'known',
    summonIds: changedSummons,
  });

  const resolved = resolveObservedLoadout(raid, [observedDeck]);

  assert.equal(resolved, raid);
  assert.equal(resolved?.weaponGridQuality, 'unknown');
});
