import assert from 'node:assert/strict';
import test from 'node:test';
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
