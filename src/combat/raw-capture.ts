import { isSensitiveJsonKey, sanitizeResponseUrl } from '../capture/policy.ts';
import type { ObservedResponse } from '../capture/types.ts';

const DB_NAME = 'gbf-inventory-tracker-raw-combat';
const DB_VERSION = 1;
const RECORD_STORE = 'records';
const MODE_KEY = 'gbfit:raw-combat-capture-mode';

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearRawCombatCaptureForOwner(tabId);
  });
}

export interface RawCombatCaptureModeState {
  enabled: boolean;
  ownerTabId?: number;
  startedAt?: number;
  skippedSensitive: number;
}

export interface RawCombatCaptureRecord {
  id: string;
  capturedAt: number;
  url: string;
  body: unknown;
}

export interface RawCombatCaptureExport {
  format: 'gbf-tool-raw-combat-capture';
  version: 1;
  startedAt?: number;
  exportedAt: number;
  skippedSensitive: number;
  records: Array<Omit<RawCombatCaptureRecord, 'id'>>;
}

export interface RawCombatCaptureStatus extends RawCombatCaptureModeState {
  count: number;
}

export function rawCombatCaptureState(
  ownerTabId: number,
  startedAt: number,
): RawCombatCaptureModeState {
  return { enabled: true, ownerTabId, startedAt, skippedSensitive: 0 };
}

export function shouldPersistRawCombatResponse(
  state: RawCombatCaptureModeState,
  ownerUrl: string | undefined,
  expectedOwnerUrl: string,
  meta: Pick<ObservedResponse, 'resourceType'>,
  verifiedCombat: boolean,
): boolean {
  return state.enabled
    && state.ownerTabId !== undefined
    && isRawCombatCaptureOwnerUrl(ownerUrl, expectedOwnerUrl)
    && (meta.resourceType === 'xhr' || meta.resourceType === 'fetch')
    && verifiedCombat;
}

export function buildRawCombatCaptureRecord(
  meta: Pick<ObservedResponse, 'requestId' | 'url'>,
  rawBody: string,
  capturedAt: number,
): RawCombatCaptureRecord | null {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (containsSensitiveJsonKey(body)) return null;

  return {
    id: `${capturedAt}:${meta.requestId}`,
    capturedAt,
    url: sanitizeResponseUrl(meta.url),
    body,
  };
}

export function buildRawCombatCaptureExport(
  state: RawCombatCaptureModeState,
  records: RawCombatCaptureRecord[],
  exportedAt: number,
): RawCombatCaptureExport {
  return {
    format: 'gbf-tool-raw-combat-capture',
    version: 1,
    startedAt: state.startedAt,
    exportedAt,
    skippedSensitive: state.skippedSensitive,
    records: [...records]
      .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id))
      .map(({ id: _id, ...record }) => record),
  };
}

export function serializeRawCombatCaptureExport(bundle: RawCombatCaptureExport): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function rawCombatCaptureFilename(exportedAt: number): string {
  return `gbf-combat-raw-${new Date(exportedAt).toISOString().replace(/[:.]/g, '-')}.json`;
}

export async function enableRawCombatCapture(ownerTabId: number, reset = true): Promise<void> {
  if (!Number.isInteger(ownerTabId) || ownerTabId < 0) throw new Error('Raw capture tab is invalid.');
  if (!reset) {
    const existing = await loadModeState();
    if (existing.enabled && existing.ownerTabId === ownerTabId) return;
  }
  const startedAt = Date.now();
  if (reset) await clearRawCombatCaptureStorage();
  await saveModeState(rawCombatCaptureState(ownerTabId, startedAt));
}

export async function disableRawCombatCapture(ownerTabId?: number): Promise<void> {
  const state = await loadModeState();
  if (ownerTabId !== undefined && state.ownerTabId !== ownerTabId) return;
  await saveModeState({ ...state, enabled: false });
}

export async function clearRawCombatCapture(): Promise<void> {
  await clearRawCombatCaptureStorage();
  const state = await loadModeState();
  if (state.enabled && state.ownerTabId !== undefined) {
    await saveModeState(rawCombatCaptureState(state.ownerTabId, Date.now()));
  } else {
    await saveModeState({ enabled: false, skippedSensitive: 0 });
  }
}

export async function getRawCombatCaptureStatus(): Promise<RawCombatCaptureStatus> {
  const [state, records] = await Promise.all([loadModeState(), getRawCombatCaptureRecords()]);
  return { ...state, count: records.length };
}

export async function getRawCombatCaptureExport(exportedAt = Date.now()): Promise<RawCombatCaptureExport> {
  const [state, records] = await Promise.all([loadModeState(), getRawCombatCaptureRecords()]);
  return buildRawCombatCaptureExport(state, records, exportedAt);
}

export async function maybeStoreRawCombatResponse(
  meta: ObservedResponse,
  rawBody: string,
  capturedAt: number,
  verifiedCombat: boolean,
): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.tabs) return false;
  if ((meta.resourceType !== 'xhr' && meta.resourceType !== 'fetch') || !verifiedCombat) return false;

  const state = await loadModeState();
  if (!state.enabled || state.ownerTabId === undefined) return false;

  let ownerUrl: string | undefined;
  try {
    ownerUrl = (await chrome.tabs.get(state.ownerTabId)).url;
  } catch {
    await expireRawCombatCapture(state);
    return false;
  }

  const expectedOwnerUrl = chrome.runtime.getURL('combat.html');
  if (!shouldPersistRawCombatResponse(state, ownerUrl, expectedOwnerUrl, meta, verifiedCombat)) {
    await expireRawCombatCapture(state);
    return false;
  }

  const record = buildRawCombatCaptureRecord(meta, rawBody, capturedAt);
  if (!record) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return false;
    }
    if (containsSensitiveJsonKey(parsed)) {
      await saveModeState({ ...state, skippedSensitive: state.skippedSensitive + 1 });
    }
    return false;
  }

  await saveRawCombatCaptureRecord(record);
  return true;
}

export function isRawCombatCaptureOwnerUrl(url: string | undefined, expectedOwnerUrl: string): boolean {
  if (!url) return false;
  try {
    const actual = new URL(url);
    const expected = new URL(expectedOwnerUrl);
    return actual.origin === expected.origin
      && actual.pathname === expected.pathname
      && actual.searchParams.get('rawCapture') === '1';
  } catch {
    return false;
  }
}

export function containsSensitiveJsonKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveJsonKey(item));
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveJsonKey(key) || containsSensitiveJsonKey(nested)) return true;
  }
  return false;
}

async function clearRawCombatCaptureForOwner(tabId: number): Promise<void> {
  const state = await loadModeState();
  if (state.ownerTabId !== tabId) return;
  await expireRawCombatCapture(state);
}

async function expireRawCombatCapture(state: RawCombatCaptureModeState): Promise<void> {
  await clearRawCombatCaptureStorage();
  await saveModeState({ enabled: false, skippedSensitive: state.skippedSensitive });
}

async function loadModeState(): Promise<RawCombatCaptureModeState> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { enabled: false, skippedSensitive: 0 };
  }
  const stored = (await chrome.storage.local.get(MODE_KEY))[MODE_KEY] as Partial<RawCombatCaptureModeState> | undefined;
  return {
    enabled: stored?.enabled === true,
    ownerTabId: Number.isInteger(stored?.ownerTabId) ? stored?.ownerTabId : undefined,
    startedAt: typeof stored?.startedAt === 'number' ? stored.startedAt : undefined,
    skippedSensitive: typeof stored?.skippedSensitive === 'number' ? stored.skippedSensitive : 0,
  };
}

async function saveModeState(state: RawCombatCaptureModeState): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [MODE_KEY]: state });
}

async function openRawCaptureDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRawCombatCaptureRecord(record: RawCombatCaptureRecord): Promise<void> {
  const db = await openRawCaptureDatabase();
  await runWrite(db, (store) => store.put(record));
  db.close();
}

async function clearRawCombatCaptureStorage(): Promise<void> {
  const db = await openRawCaptureDatabase();
  await runWrite(db, (store) => store.clear());
  db.close();
}

async function getRawCombatCaptureRecords(): Promise<RawCombatCaptureRecord[]> {
  const db = await openRawCaptureDatabase();
  const records = await new Promise<RawCombatCaptureRecord[]>((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, 'readonly');
    const request = tx.objectStore(RECORD_STORE).getAll();
    request.onsuccess = () => resolve(request.result as RawCombatCaptureRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id));
}

async function runWrite(
  db: IDBDatabase,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORD_STORE, 'readwrite');
    operation(tx.objectStore(RECORD_STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Raw combat capture transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Raw combat capture transaction aborted'));
  });
}
