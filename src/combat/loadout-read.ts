import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';

type ActiveRow = { key: string; parse: NormalizedRaidParse & { loadout?: RaidLoadoutSnapshot } };
type HistoryRow = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

export async function readPersistedRaidLoadouts(): Promise<{
  active: ReadonlyMap<string, RaidLoadoutSnapshot | undefined>;
  history: ReadonlyMap<string, RaidLoadoutSnapshot | undefined>;
}> {
  const db = await openCombatDatabase();
  const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readonly');
  const [activeRows, historyRows] = await Promise.all([
    requestValue<ActiveRow[]>(tx.objectStore(ACTIVE_STORE).getAll()),
    requestValue<HistoryRow[]>(tx.objectStore(HISTORY_STORE).getAll()),
  ]);
  db.close();
  return {
    active: new Map(activeRows.map((row) => [row.key, row.parse.loadout])),
    history: new Map(historyRows.map((row) => [row.localId, row.loadout])),
  };
}

async function openCombatDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) db.createObjectStore(ACTIVE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'localId' });
      if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE, { keyPath: 'raidTechnicalId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
