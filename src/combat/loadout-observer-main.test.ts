import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import { minimizePersistedDeck } from './loadout-observer.ts';
import {
  mergeDeckEvidenceIntoRaid,
  selectCachedDeckForRaid,
} from './loadout-observer-main.ts';

function loadout(options: {
  deckId?: string;
  observedAt?: number;
  grid?: 'unknown' | 'partial' | 'known';
  mainWeaponId?: string;
  secondWeaponId?: string;
} = {}): RaidLoadoutSnapshot {
  const observedAt = options.observedAt ?? 1000;
  const grid = options.grid ?? 'known';
  const mainWeaponId = options.mainWeaponId ?? 'w1';
  return {
    quality: grid,
    observedAt,
    updatedAt: observedAt,
    correlation: options.deckId ? 'deck-id' : 'signature',
    deckId: options.deckId,
    signature: {
      npcIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
      summonIds: ['s1', 's2', 's3', 's4', 's5'],
      mainWeaponId,
    },
    partyQuality: 'known',
    party: [],
    summonQuality: 'known',
    summons: [],
    mainWeaponId,
    weaponGridQuality: grid,
    weapons: grid === 'unknown' ? [] : [
      { slot: 1, masterId: mainWeaponId },
      { slot: 2, masterId: options.secondWeaponId ?? 'w2' },
    ],
    calculator: { quality: 'unknown', enhancement: {}, boosts: [] },
  };
}

test('observed deck id wins over a conflicting historical signature', () => {
  const raid = loadout({ deckId: '84', grid: 'unknown', mainWeaponId: 'new-main' });
  const exact = minimizePersistedDeck(loadout({ deckId: '84', mainWeaponId: 'old-main', secondWeaponId: 'exact-grid' }));
  const signatureMatch = minimizePersistedDeck(loadout({ deckId: '85', mainWeaponId: 'new-main', secondWeaponId: 'wrong-grid' }));

  assert.equal(selectCachedDeckForRaid(raid, [signatureMatch, exact])?.deckId, '84');
});

test('observed deck id never falls back to another deck with a matching signature', () => {
  const raid = loadout({ deckId: '84', grid: 'unknown' });
  const other = minimizePersistedDeck(loadout({ deckId: '85' }));

  assert.equal(selectCachedDeckForRaid(raid, [other]), undefined);
});

test('cached grid may enrich by exact deck id even when the old signature no longer matches', () => {
  const raid = loadout({ deckId: '84', grid: 'unknown', mainWeaponId: 'new-main', observedAt: 3000 });
  const cached = minimizePersistedDeck(loadout({ deckId: '84', mainWeaponId: 'old-main', secondWeaponId: 'cached-grid', observedAt: 1000 }));
  const merged = mergeDeckEvidenceIntoRaid(raid, cached, 'cached');

  assert.equal(merged.deckId, '84');
  assert.equal(merged.correlation, 'deck-id');
  assert.equal(merged.weaponGridQuality, 'known');
  assert.equal(merged.weaponGridSource, 'cached');
  assert.equal(merged.weaponGridObservedAt, 1000);
  assert.deepEqual(merged.weapons.map((weapon) => weapon.masterId), ['old-main', 'cached-grid']);
});

test('fresh observation of the same deck replaces cached evidence and provenance', () => {
  const raid = loadout({ deckId: '84', grid: 'unknown', mainWeaponId: 'new-main', observedAt: 3000 });
  const cached = minimizePersistedDeck(loadout({ deckId: '84', mainWeaponId: 'old-main', secondWeaponId: 'cached-grid', observedAt: 1000 }));
  const seeded = mergeDeckEvidenceIntoRaid(raid, cached, 'cached');
  const fresh = loadout({ deckId: '84', mainWeaponId: 'fresh-main', secondWeaponId: 'fresh-grid', observedAt: 4000 });
  const merged = mergeDeckEvidenceIntoRaid(seeded, fresh, 'observed');

  assert.equal(merged.weaponGridSource, 'observed');
  assert.equal(merged.weaponGridObservedAt, 4000);
  assert.deepEqual(merged.weapons.map((weapon) => weapon.masterId), ['fresh-main', 'fresh-grid']);
});
