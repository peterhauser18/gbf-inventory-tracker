import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountDatabaseState } from './database.ts';
import {
  ACCOUNT_DATABASE_STORAGE_KEY,
  loadAccountDatabase,
  type AccountStorageArea,
} from './storage.ts';

test('concurrent account loads share one storage read and later loads stay fresh', async () => {
  let getCalls = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const stored = { version: 1, snapshot: {} };
  const area: AccountStorageArea = {
    get: async (key) => {
      getCalls += 1;
      await gate;
      return { [key]: stored };
    },
    set: async () => {},
    remove: async () => {},
  };

  const first = loadAccountDatabase(area);
  const second = loadAccountDatabase(area);
  assert.equal(getCalls, 1);

  release?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult, stored);
  assert.equal(secondResult, stored);

  await loadAccountDatabase(area);
  assert.equal(getCalls, 2, 'completed reads must not become a stale page-lifetime cache');
});

test('loading an older persisted state projects stash weapon instances into the normal weapons view', async () => {
  const stored: AccountDatabaseState = {
    version: 1,
    observedAt: {},
    snapshot: {
      characters: [],
      weapons: [],
      summons: [],
      artifacts: [],
      weaponStashes: [{
        stashId: '7',
        quality: 'known',
        weapons: [{ id: 'stash-weapon-1', masterId: '1040000001', updatedAt: 100 }],
      }],
      treasures: [],
      consumables: [],
      tickets: [],
      progression: [],
      quality: {
        characters: 'unknown', weapons: 'unknown', summons: 'unknown', artifacts: 'unknown',
        treasures: 'unknown', consumables: 'unknown', tickets: 'unknown', accountStatus: 'unknown', progression: 'unknown',
      },
      capturedAt: 100,
    },
  };
  const area: AccountStorageArea = {
    async get(key) { return { [key]: stored }; },
    async set() {},
    async remove() {},
  };

  const loaded = await loadAccountDatabase(area);
  assert.equal(loaded?.snapshot.weapons.length, 1);
  assert.equal(loaded?.snapshot.weapons[0]?.id, 'stash-weapon-1');
  assert.equal(loaded?.snapshot.quality.weapons, 'unknown');
});
