import {
  isSensitiveJsonKey,
  redactSensitiveJson,
  sanitizeResponseUrl,
} from '../capture/policy.ts';
import type { ObservedResponse } from '../capture/types.ts';

const DB_NAME = 'gbf-inventory-tracker-raw-combat';
const DB_VERSION = 3;
const RECORD_STORE = 'records';
const READ_FAILURE_STORE = 'read-failures';
const MODE_KEY = 'gbfit:raw-combat-capture-mode';

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  void clearStaleRawCombatCapture();
  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearRawCombatCaptureForOwner(tabId);
  });
}

export interface RawCombatCaptureModeState {
  enabled: boolean;
  ownerTabId?: number;
  startedAt?: number;
  redactedSensitiveFields: number;
}

export interface RawCombatCaptureRecord {
  id: string;
  capturedAt: number;
  url: string;
  redactedSensitiveFields: number;
  body: unknown;
}

export type RawCombatReadFailureReason = 'response-body-unavailable';

export interface RawCombatReadFailure {
  id: string;
  capturedAt: number;
  url: string;
  reason: RawCombatReadFailureReason;
}

export interface RawCombatCaptureExport {
  format: 'gbf-tool-raw-combat-capture';
  version: 2;
  startedAt?: number;
  exportedAt: number;
  redactedSensitiveFields: number;
  records: Array<Omit<RawCombatCaptureRecord, 'id'>>;
  readFailures: Array<Omit<RawCombatReadFailure, 'id'>>;
}

export interface RawCombatCaptureStatus extends RawCombatCaptureModeState {
  count: number;
  readFailureCount: number;
}

export function rawCombatCaptureState(
  ownerTabId: number,
  startedAt: number,
): RawCombatCaptureModeState {
  return { enabled: true, ownerTabId, startedAt, redactedSensitiveFields: 0 };
}

export function shouldPersistRawCombatResponse(
  state: RawCombatCaptureModeState,
  ownerTabAvailable: boolean,
  meta: Pick<ObservedResponse, 'resourceType'>,
  verifiedCombat: boolean,
): boolean {
  return state.enabled
    && state.ownerTabId !== undefined
    && ownerTabAvailable
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

  return {
    id: `${capturedAt}:${meta.requestId}`,
    capturedAt,
    url: sanitizeResponseUrl(meta.url),
    redactedSensitiveFields: countSensitiveJsonKeys(body),
    body: redactSensitiveJson(body),
  };
}

export function buildRawCombatReadFailure(
  meta: Pick<ObservedResponse, 'requestId' | 'url'>,
  capturedAt: number,
  reason: RawCombatReadFailureReason = 'response-body-unavailable',
): RawCombatReadFailure {
  return {
    id: `${capturedAt}:${meta.requestId}:read-failure`,
    capturedAt,
    url: sanitizeResponseUrl(meta.url),
    reason,
  };
}

export function buildRawCombatCaptureExport(
  state: RawCombatCaptureModeState,
  records: RawCombatCaptureRecord[],
  exportedAt: number,
  readFailures: RawCombatReadFailure[] = [],
): RawCombatCaptureExport {
  return {
    format: 'gbf-tool-raw-combat-capture',
    version: 2,
    startedAt: state.startedAt,
    exportedAt,
    redactedSensitiveFields: state.redactedSensitiveFields,
    records: [...records]
      .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id))
      .map(({ id: _id, ...record }) => record),
    readFailures: [...readFailures]
      .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id))
      .map(({ id: _id, ...failure }) => failure),
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

export async function clearRawCombatCapture(): Promise<void> {
  await clearRawCombatCaptureStorage();
  const state = await loadModeState();
  if (state.enabled && state.ownerTabId !== undefined) {
    await saveModeState(rawCombatCaptureState(state.ownerTabId, Date.now()));
  } else {
    await saveModeState({ enabled: false, redactedSensitiveFields: 0 });
  }
}

export async function getRawCombatCaptureStatus(): Promise<RawCombatCaptureStatus> {
  const [state, count, readFailureCount] = await Promise.all([
    loadModeState(),
    countRawCombatCaptureRecords(),
    countRawCombatReadFailures(),
  ]);
  return { ...state, count, readFailureCount };
}

export async function getRawCombatCaptureExport(exportedAt = Date.now()): Promise<RawCombatCaptureExport> {
  const [state, records, readFailures] = await Promise.all([
    loadModeState(),
    getRawCombatCaptureRecords(),
    getRawCombatReadFailures(),
  ]);
  return buildRawCombatCaptureExport(state, records, exportedAt, readFailures);
}

export async function maybeStoreRawCombatResponse(
  meta: ObservedResponse,
  rawBody: string,
  capturedAt: number,
  verifiedCombat: boolean,
): Promise<boolean> {
  const state = await activeRawCombatState(meta, verifiedCombat);
  if (!state) return false;

  const record = buildRawCombatCaptureRecord(meta, rawBody, capturedAt);
  if (!record) return false;

  await saveRawCombatCaptureRecord(record);
  if (record.redactedSensitiveFields > 0) {
    await saveModeState({
      ...state,
      redactedSensitiveFields: state.redactedSensitiveFields + record.redactedSensitiveFields,
    });
  }
  return true;
}

export async function maybeStoreRawCombatReadFailure(
  meta: ObservedResponse,
  capturedAt: number,
  verifiedCombat: boolean,
  reason: RawCombatReadFailureReason = 'response-body-unavailable',
): Promise<boolean> {
  const state = await activeRawCombatState(meta, verifiedCombat);
  if (!state) return false;
  await saveRawCombatReadFailure(buildRawCombatReadFailure(meta, capturedAt, reason));
  return true;
}

export function countSensitiveJsonKeys(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countSensitiveJsonKeys(item), 0);
  }
  if (!value || typeof value !== 'object') return 0;

  let count = 0;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveJsonKey(key)) count += 1;
    else count += countSensitiveJsonKeys(nested);
  }
  return count;
}

async function activeRawCombatState(
  meta: Pick<ObservedResponse, 'resourceType'>,
  verifiedCombat: boolean,
): Promise<RawCombatCaptureModeState | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.tabs) return null;
  if ((meta.resourceType !== 'xhr' && meta.resourceType !== 'fetch') || !verifiedCombat) return null;

  const state = await loadModeState();
  if (!state.enabled || state.ownerTabId === undefined) return null;

  let ownerTabAvailable = false;
  try {
    await chrome.tabs.get(state.ownerTabId);
    ownerTabAvailable = true;
  } catch {
    await expireRawCombatCapture(state);
    return null;
  }

  return shouldPersistRawCombatResponse(state, ownerTabAvailable, meta, verifiedCombat) ? state : null;
}

async function clearStaleRawCombatCapture(): Promise<void> {
  const state = await loadModeState();
  if (!state.enabled || state.ownerTabId === undefined) return;
  try {
    await chrome.tabs.get(state.ownerTabId);
    return;
  } catch {
    // Missing owner tab means the prior raw session has ended.
  }
  await expireRawCombatCapture(state);
}

async function clearRawCombatCaptureForOwner(tabId: number): Promise<void> {
  const state = await loadModeState();
  if (state.ownerTabId !== tabId) return;
  await expireRawCombatCapture(state);
}

async function expireRawCombatCapture(state: RawCombatCaptureModeState): Promise<void> {
  await clearRawCombatCaptureStorage();
  await saveModeState({ enabled: false, redactedSensitiveFields: state.redactedSensitiveFields });
}

async function loadModeState(): Promise<RawCombatCaptureModeState> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { enabled: false, redactedSensitiveFields: 0 };
  }
  const stored = (await chrome.storage.local.get(MODE_KEY))[MODE_KEY] as Partial<RawCombatCaptureModeState> | undefined;
  return {
    enabled: stored?.enabled === true,
    ownerTabId: Number.isInteger(stored?.ownerTabId) ? stored?.ownerTabId : undefined,
    startedAt: typeof stored?.startedAt === 'number' ? stored.startedAt : undefined,
    redactedSensitiveFields: typeof stored?.redactedSensitiveFields === 'number'
      ? stored.redactedSensitiveFields
      : 0,
  };
}

async function saveModeState(state: RawCombatCaptureModeState): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [MODE_KEY]: state });
}

async function openRawCaptureDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORD_STORE)) {
        db.createObjectStore(RECORD_STORE, { keyPath: 'id' });
      } else if (event.oldVersion < DB_VERSION) {
        request.transaction?.objectStore(RECORD_STORE).clear();
      }
      if (!db.objectStoreNames.contains(READ_FAILURE_STORE)) {
        db.createObjectStore(READ_FAILURE_STORE, { keyPath: 'id' });
      } else if (event.oldVersion < DB_VERSION) {
        request.transaction?.objectStore(READ_FAILURE_STORE).clear();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRawCombatCaptureRecord(record: RawCombatCaptureRecord): Promise<void> {
  const db = await openRawCaptureDatabase();
  await runWrite(db, RECORD_STORE, (store) => store.put(record));
  db.close();
}

async function saveRawCombatReadFailure(failure: RawCombatReadFailure): Promise<void> {
  const db = await openRawCaptureDatabase();
  await runWrite(db, READ_FAILURE_STORE, (store) => store.put(failure));
  db.close();
}

async function clearRawCombatCaptureStorage(): Promise<void> {
  const db = await openRawCaptureDatabase();
  await runWrite(db, RECORD_STORE, (store) => store.clear());
  await runWrite(db, READ_FAILURE_STORE, (store) => store.clear());
  db.close();
}

async function countRawCombatCaptureRecords(): Promise<number> {
  return await countStore(RECORD_STORE);
}

async function countRawCombatReadFailures(): Promise<number> {
  return await countStore(READ_FAILURE_STORE);
}

async function countStore(storeName: string): Promise<number> {
  const db = await openRawCaptureDatabase();
  const count = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return count;
}

async function getRawCombatCaptureRecords(): Promise<RawCombatCaptureRecord[]> {
  return await getAllStore<RawCombatCaptureRecord>(RECORD_STORE);
}

async function getRawCombatReadFailures(): Promise<RawCombatReadFailure[]> {
  return await getAllStore<RawCombatReadFailure>(READ_FAILURE_STORE);
}

async function getAllStore<T extends { id: string; capturedAt: number }>(storeName: string): Promise<T[]> {
  const db = await openRawCaptureDatabase();
  const records = await new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records.sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id));
}

async function runWrite(
  db: IDBDatabase,
  storeName: string,
  operation: (store: IDBObjectStore) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    operation(tx.objectStore(storeName));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Raw combat capture transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Raw combat capture transaction aborted'));
  });
}
