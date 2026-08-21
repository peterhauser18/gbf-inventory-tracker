import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import {
  minimizePersistedDeck,
  mergeDeckObservationIntoRaid,
  persistObservedDeck,
  readPersistedDecks,
  type LoadoutCacheStorageArea,
} from './loadout-observer.ts';
import { selectMatchingDeck } from './loadout.ts';

function loadout(options: {
  deckId?: string;
  observedAt?: number;
  grid?: 'unknown' | 'partial' | 'known';
  weaponIds?: string[];
  mainWeaponId?: string;
} = {}): RaidLoadoutSnapshot {
  const observedAt = options.observedAt ?? 1000;
  const grid = options.grid ?? 'known';
  const ids = options.weaponIds ?? ['w1', 'w2'];
  return {
    quality: grid,
    observedAt,
    updatedAt: observedAt,
    correlation: 'signature',
    deckId: options.deckId,
    signature: {
      npcIds: ['c1','c2','c3','c4','c5'],
      summonIds: ['s1','s2','s3','s4','s5'],
      mainWeaponId: options.mainWeaponId ?? 'w1',
    },
    partyQuality: 'known',
    party: [{ position: 1, id: 'c1', name: 'Private display name', frontline: true }],
    summonQuality: 'known',
    summons: [{ position: 0, id: 's1', name: 'Summon', support: false }],
    mainWeaponId: options.mainWeaponId ?? 'w1',
    jobId: 'job',
    jobName: 'Job Name',
    weaponGridQuality: grid,
    weapons: ids.map((masterId, index) => ({ slot: index + 1, masterId, name: `Weapon ${masterId}` })),
    calculator: { quality: 'known', estimatedDamage: 123, enhancement: {}, boosts: [] },
  };
}

function storage(): { area: LoadoutCacheStorageArea; values: Record<string, unknown> } {
  const values: Record<string, unknown> = {};
  return {
    values,
    area: {
      async get(key) { return { [key]: values[key] }; },
      async set(items) { Object.assign(values, items); },
    },
  };
}

test('persisted deck snapshot is minimized and marked cached without party or summon display rows', () => {
  const cached = minimizePersistedDeck(loadout({ deckId: '84', observedAt: 1000 }));
  assert.equal(cached.deckId, '84');
  assert.equal(cached.weaponGridSource, 'cached');
  assert.equal(cached.weaponGridObservedAt, 1000);
  assert.deepEqual(cached.party, []);
  assert.deepEqual(cached.summons, []);
  assert.equal(cached.jobId, undefined);
  assert.equal(cached.jobName, undefined);
  assert.equal(cached.signature.npcIds.length, 5);
  assert.equal(cached.weapons.length, 2);
});

test('persisted cache deduplicates by deck id, survives reread, and stays bounded', async () => {
  const { area } = storage();
  for (let index = 1; index <= 22; index += 1) {
    await persistObservedDeck(loadout({ deckId: String(index), observedAt: index * 1000 }), area);
  }
  await persistObservedDeck(loadout({ deckId: '22', observedAt: 23000, weaponIds: ['new-main', 'w2'], mainWeaponId: 'new-main' }), area);
  const cached = await readPersistedDecks(area);
  assert.equal(cached.length, 20);
  assert.equal(cached.some((deck) => deck.deckId === '1'), false);
  assert.equal(cached.some((deck) => deck.deckId === '2'), false);
  const newest = cached.find((deck) => deck.deckId === '22');
  assert.equal(newest?.weapons[0]?.masterId, 'new-main');
  assert.equal(newest?.weaponGridSource, 'cached');
});

test('conflicting historical grids with the same strict signature fail closed', () => {
  const start = loadout({ deckId: undefined, observedAt: 3000, grid: 'unknown', weaponIds: [] });
  start.weaponGridQuality = 'unknown';
  start.weapons = [];
  const one = minimizePersistedDeck(loadout({ deckId: '84', weaponIds: ['w1','a'] }));
  const two = minimizePersistedDeck(loadout({ deckId: '85', weaponIds: ['w1','b'] }));
  assert.equal(selectMatchingDeck(start.signature, [one, two]), undefined);
});

test('cached known grid seeds an unknown raid without becoming freshly observed', () => {
  const start = loadout({ deckId: undefined, observedAt: 3000, grid: 'unknown', weaponIds: [] });
  start.weaponGridQuality = 'unknown';
  start.weapons = [];
  start.calculator = { quality: 'unknown', enhancement: {}, boosts: [] };
  const cached = minimizePersistedDeck(loadout({ deckId: '84', observedAt: 1000, weaponIds: ['w1','old'] }));
  const merged = mergeDeckObservationIntoRaid(start, cached, 'cached');
  assert.equal(merged.weaponGridQuality, 'known');
  assert.equal(merged.weaponGridSource, 'cached');
  assert.equal(merged.weaponGridObservedAt, 1000);
  assert.equal(merged.deckId, undefined);
  assert.deepEqual(merged.weapons.map((weapon) => weapon.masterId), ['w1','old']);
});

test('fresh matching observation replaces an equally-known cached grid but weaker fresh data does not downgrade it', () => {
  const start = loadout({ deckId: undefined, observedAt: 3000, grid: 'unknown', weaponIds: [] });
  start.weaponGridQuality = 'unknown';
  start.weapons = [];
  start.calculator = { quality: 'unknown', enhancement: {}, boosts: [] };
  const cached = mergeDeckObservationIntoRaid(
    start,
    minimizePersistedDeck(loadout({ deckId: '84', observedAt: 1000, weaponIds: ['w1','old'] })),
    'cached',
  );
  const fresh = loadout({ deckId: '84', observedAt: 4000, weaponIds: ['w1','fresh'] });
  const refreshed = mergeDeckObservationIntoRaid(cached, fresh, 'observed');
  assert.equal(refreshed.weaponGridSource, 'observed');
  assert.equal(refreshed.weaponGridObservedAt, 4000);
  assert.deepEqual(refreshed.weapons.map((weapon) => weapon.masterId), ['w1','fresh']);
  assert.equal(refreshed.deckId, '84');

  const partial = loadout({ deckId: '84', observedAt: 5000, grid: 'partial', weaponIds: ['w1'] });
  const preserved = mergeDeckObservationIntoRaid(refreshed, partial, 'observed');
  assert.equal(preserved.weaponGridQuality, 'known');
  assert.deepEqual(preserved.weapons.map((weapon) => weapon.masterId), ['w1','fresh']);
});
