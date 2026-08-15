import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountSnapshot, DataQuality } from '../types/account.ts';
import { createAccountDatabase, mergeAccountDatabase } from './database.ts';
import {
  ACCOUNT_DATABASE_STORAGE_KEY,
  loadAccountDatabase,
  resetAccountDatabase,
  saveAccountDatabase,
  type AccountStorageArea,
} from './storage.ts';

function snapshot(at: number, options: {
  characterQuality?: DataQuality;
  characters?: Array<{ id: string; masterId: string; level?: number; updatedAt: number }>;
  treasureQuality?: DataQuality;
  treasures?: Array<{ itemId: string; quantity: number; updatedAt: number }>;
} = {}): AccountSnapshot {
  return {
    characters: options.characters ?? [],
    weapons: [],
    summons: [],
    artifacts: [],
    weaponStashes: [],
    treasures: options.treasures ?? [],
    consumables: [],
    tickets: [],
    progression: [],
    quality: {
      characters: options.characterQuality ?? 'unknown',
      weapons: 'unknown',
      summons: 'unknown',
      artifacts: 'unknown',
      treasures: options.treasureQuality ?? 'unknown',
      consumables: 'unknown',
      tickets: 'unknown',
      accountStatus: 'unknown',
      progression: 'unknown',
    },
    capturedAt: at,
  };
}

test('partial observations accumulate across sessions without deleting unseen roster entries', () => {
  const first = createAccountDatabase(snapshot(100, {
    characterQuality: 'partial',
    characters: [{ id: 'a', masterId: '1', level: 10, updatedAt: 100 }],
  }));
  const merged = mergeAccountDatabase(first, snapshot(200, {
    characterQuality: 'partial',
    characters: [{ id: 'b', masterId: '2', level: 20, updatedAt: 200 }],
  }));

  assert.deepEqual(merged.snapshot.characters.map((value) => value.id), ['a', 'b']);
  assert.equal(merged.snapshot.quality.characters, 'partial');
  assert.equal(merged.observedAt.characters, 200);
});

test('newer explicit values replace older values for the same technical identity', () => {
  const first = createAccountDatabase(snapshot(100, {
    characterQuality: 'partial',
    characters: [{ id: 'a', masterId: '1', level: 10, updatedAt: 100 }],
  }));
  const merged = mergeAccountDatabase(first, snapshot(200, {
    characterQuality: 'partial',
    characters: [{ id: 'a', masterId: '1', level: 50, updatedAt: 200 }],
  }));

  assert.equal(merged.snapshot.characters[0]?.level, 50);
});

test('complete roster coverage replaces stale members while partial coverage cannot', () => {
  const first = createAccountDatabase(snapshot(100, {
    characterQuality: 'known',
    characters: [
      { id: 'a', masterId: '1', updatedAt: 100 },
      { id: 'stale', masterId: '9', updatedAt: 100 },
    ],
  }));
  const partial = mergeAccountDatabase(first, snapshot(200, {
    characterQuality: 'partial',
    characters: [{ id: 'a', masterId: '1', updatedAt: 200 }],
  }));
  assert.deepEqual(partial.snapshot.characters.map((value) => value.id), ['a', 'stale']);
  assert.equal(partial.snapshot.quality.characters, 'partial');

  const complete = mergeAccountDatabase(partial, snapshot(300, {
    characterQuality: 'known',
    characters: [{ id: 'a', masterId: '1', updatedAt: 300 }],
  }));
  assert.deepEqual(complete.snapshot.characters.map((value) => value.id), ['a']);
  assert.equal(complete.snapshot.quality.characters, 'known');
});

test('explicit zero stays known while an unseen treasure is not invented', () => {
  const first = createAccountDatabase(snapshot(100, {
    treasureQuality: 'known',
    treasures: [{ itemId: 'old', quantity: 7, updatedAt: 100 }],
  }));
  const merged = mergeAccountDatabase(first, snapshot(200, {
    treasureQuality: 'known',
    treasures: [{ itemId: 'zero', quantity: 0, updatedAt: 200 }],
  }));

  assert.deepEqual(merged.snapshot.treasures, [{ itemId: 'zero', quantity: 0, updatedAt: 200 }]);
  assert.equal(merged.snapshot.treasures.find((value) => value.itemId === 'missing'), undefined);
});

test('older observations cannot overwrite or downgrade a newer family state', () => {
  const current = createAccountDatabase(snapshot(300, {
    characterQuality: 'known',
    characters: [{ id: 'a', masterId: '1', level: 50, updatedAt: 300 }],
  }));
  const merged = mergeAccountDatabase(current, snapshot(200, {
    characterQuality: 'partial',
    characters: [{ id: 'a', masterId: '1', level: 10, updatedAt: 200 }],
  }));

  assert.equal(merged.snapshot.characters[0]?.level, 50);
  assert.equal(merged.snapshot.quality.characters, 'known');
  assert.equal(merged.observedAt.characters, 300);
});

test('account database persists and resets through the storage seam', async () => {
  const values: Record<string, unknown> = {};
  const area: AccountStorageArea = {
    async get(key) { return { [key]: values[key] }; },
    async set(items) { Object.assign(values, items); },
    async remove(key) { delete values[key]; },
  };
  const state = createAccountDatabase(snapshot(100, { characterQuality: 'partial' }));

  await saveAccountDatabase(state, area);
  assert.deepEqual(await loadAccountDatabase(area), state);
  assert.ok(values[ACCOUNT_DATABASE_STORAGE_KEY]);
  await resetAccountDatabase(area);
  assert.equal(await loadAccountDatabase(area), null);
});
