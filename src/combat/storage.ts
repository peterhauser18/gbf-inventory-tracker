import type { CapturedResponseRecord } from '../capture/types.ts';
import { parseRaidParseExport } from './export.ts';
import { mergeCombatObservation, parseCombatObservation } from './parser.ts';
import type { NormalizedRaidParse, RaidDropPreferences, RaidHistoryRecord } from './types.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const LATEST_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';
const LATEST_KEY = 'latest';

interface LatestRow { key: typeof LATEST_KEY; parse: NormalizedRaidParse; }

export async function ingestCapturedCombatRecord(record: CapturedResponseRecord): Promise<NormalizedRaidParse | null> {
  const observation = parseCombatObservation(record);
  if (!observation) return null;
  const current = await getLatestCombatParse();
  const next = mergeCombatObservation(current, observation);
  await saveLatest(next);
  if (isTerminal(next.result)) await upsertCapturedHistory(next);
  return next;
}

export async function getLatestCombatParse(): Promise<NormalizedRaidParse | null> {
  const db = await openCombatDatabase();
  const value = await requestValue<LatestRow | undefined>(db.transaction(LATEST_STORE, 'readonly').objectStore(LATEST_STORE).get(LATEST_KEY));
  db.close();
  return value?.parse ?? null;
}

export async function getRaidHistory(): Promise<RaidHistoryRecord[]> {
  const db = await openCombatDatabase();
  const values = await requestValue<RaidHistoryRecord[]>(db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAll());
  db.close();
  return values.sort((a, b) => (b.observedEndedAt ?? b.lastObservedAt) - (a.observedEndedAt ?? a.lastObservedAt));
}

export async function getAllDropPreferences(): Promise<RaidDropPreferences[]> {
  const db = await openCombatDatabase();
  const values = await requestValue<RaidDropPreferences[]>(db.transaction(PREFS_STORE, 'readonly').objectStore(PREFS_STORE).getAll());
  db.close();
  return values;
}

export async function saveDropPreferences(preference: RaidDropPreferences): Promise<void> {
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(PREFS_STORE, 'readwrite'), (tx) => tx.objectStore(PREFS_STORE).put(preference));
  db.close();
}

export async function updateRaidLocalState(localId: string, patch: { favorite?: boolean; note?: string }): Promise<void> {
  const db = await openCombatDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.get(localId);
    request.onsuccess = () => {
      const current = request.result as RaidHistoryRecord | undefined;
      if (!current) return;
      store.put({
        ...current,
        favorite: patch.favorite ?? current.favorite,
        note: patch.note === undefined ? current.note : patch.note.trim() || undefined,
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function importRaidParseJson(json: string): Promise<RaidHistoryRecord> {
  const parse = parseRaidParseExport(json);
  const record: RaidHistoryRecord = {
    ...parse,
    localId: `import:${crypto.randomUUID()}`,
    source: 'imported',
    favorite: false,
  };
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(HISTORY_STORE, 'readwrite'), (tx) => tx.objectStore(HISTORY_STORE).put(record));
  db.close();
  return record;
}

async function saveLatest(parse: NormalizedRaidParse): Promise<void> {
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(LATEST_STORE, 'readwrite'), (tx) => tx.objectStore(LATEST_STORE).put({ key: LATEST_KEY, parse } satisfies LatestRow));
  db.close();
}

async function upsertCapturedHistory(parse: NormalizedRaidParse): Promise<void> {
  const end = parse.observedEndedAt ?? parse.lastObservedAt;
  const localId = `capture:${parse.raidTechnicalId}:${end}`;
  const db = await openCombatDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.get(localId);
    request.onsuccess = () => {
      const current = request.result as RaidHistoryRecord | undefined;
      store.put({
        ...parse,
        localId,
        source: 'captured',
        favorite: current?.favorite ?? false,
        note: current?.note,
      } satisfies RaidHistoryRecord);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function openCombatDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LATEST_STORE)) db.createObjectStore(LATEST_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'localId' });
      if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE, { keyPath: 'raidTechnicalId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isTerminal(result: NormalizedRaidParse['result']): boolean { return result === 'victory' || result === 'failure' || result === 'left'; }
function requestValue<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function transactionDone(tx: IDBTransaction, operation: (tx: IDBTransaction) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    operation(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
