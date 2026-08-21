import type { AccountDatabaseState } from './database.ts';
import {
  ACCOUNT_DATABASE_VERSION,
  mergeAccountDatabase,
  normalizeAccountDatabaseState,
} from './database.ts';

export const ACCOUNT_DATABASE_STORAGE_KEY = 'gbfit:account-database-v1';

export interface AccountStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

const pendingLoads = new WeakMap<AccountStorageArea, Promise<AccountDatabaseState | null>>();

export async function loadAccountDatabase(area?: AccountStorageArea): Promise<AccountDatabaseState | null> {
  const storage = area ?? chromeAccountStorage();
  const existing = pendingLoads.get(storage);
  if (existing) return existing;

  const pending = readAccountDatabase(storage).finally(() => {
    if (pendingLoads.get(storage) === pending) pendingLoads.delete(storage);
  });
  pendingLoads.set(storage, pending);
  return pending;
}

async function readAccountDatabase(storage: AccountStorageArea): Promise<AccountDatabaseState | null> {
  const result = await storage.get(ACCOUNT_DATABASE_STORAGE_KEY);
  const value = result[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!isObject(value) || value.version !== ACCOUNT_DATABASE_VERSION || !isObject(value.snapshot)) return null;
  return normalizeAccountDatabaseState(value as unknown as AccountDatabaseState);
}

export async function saveAccountDatabase(
  state: AccountDatabaseState,
  area?: AccountStorageArea,
): Promise<void> {
  const storage = area ?? chromeAccountStorage();
  const current = await readAccountDatabase(storage);
  const next = current ? mergeAccountDatabase(current, state.snapshot) : normalizeAccountDatabaseState(state);
  await storage.set({ [ACCOUNT_DATABASE_STORAGE_KEY]: next });
}

export async function resetAccountDatabase(area?: AccountStorageArea): Promise<void> {
  const storage = area ?? chromeAccountStorage();
  await storage.remove(ACCOUNT_DATABASE_STORAGE_KEY);
}

function chromeAccountStorage(): AccountStorageArea {
  return chrome.storage.local as unknown as AccountStorageArea;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
