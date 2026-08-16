import type { AccountDatabaseState } from './database.ts';
import { ACCOUNT_DATABASE_VERSION } from './database.ts';

export const ACCOUNT_DATABASE_STORAGE_KEY = 'gbfit:account-database-v1';

export interface AccountStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export async function loadAccountDatabase(area?: AccountStorageArea): Promise<AccountDatabaseState | null> {
  const storage = area ?? chromeAccountStorage();
  const result = await storage.get(ACCOUNT_DATABASE_STORAGE_KEY);
  const value = result[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!isObject(value) || value.version !== ACCOUNT_DATABASE_VERSION || !isObject(value.snapshot)) return null;
  return value as unknown as AccountDatabaseState;
}

export async function saveAccountDatabase(
  state: AccountDatabaseState,
  area?: AccountStorageArea,
): Promise<void> {
  const storage = area ?? chromeAccountStorage();
  await storage.set({ [ACCOUNT_DATABASE_STORAGE_KEY]: state });
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
