import type {
  CharacterInstance,
  ProgressionState,
  SummonInstance,
  TreasureCount,
  WeaponInstance,
} from '../types/account';

const DB_NAME = 'gbf-inventory-tracker';
const DB_VERSION = 1;

export type StoreName = 'characters' | 'weapons' | 'summons' | 'treasures' | 'progression';

export interface StoreRecordMap {
  characters: CharacterInstance;
  weapons: WeaponInstance;
  summons: SummonInstance;
  treasures: TreasureCount;
  progression: ProgressionState;
}

export async function openDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      createStore(db, 'characters', 'id');
      createStore(db, 'weapons', 'id');
      createStore(db, 'summons', 'id');
      createStore(db, 'treasures', 'itemId');
      createStore(db, 'progression', 'key');
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createStore(db: IDBDatabase, name: StoreName, keyPath: string): void {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, { keyPath });
  }
}

export async function putMany<K extends StoreName>(
  storeName: K,
  records: StoreRecordMap[K][],
): Promise<void> {
  if (records.length === 0) return;

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function getAll<K extends StoreName>(storeName: K): Promise<StoreRecordMap[K][]> {
  const db = await openDatabase();
  const records = await new Promise<StoreRecordMap[K][]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as StoreRecordMap[K][]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}
