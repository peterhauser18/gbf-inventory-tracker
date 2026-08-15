import { addRecordToSummary, emptyCaptureSummary } from './policy.ts';
import type { CaptureScanSummary, CapturedResponseRecord } from './types.ts';

const DB_NAME = 'gbf-inventory-tracker-captures';
const DB_VERSION = 1;
const RESPONSE_STORE = 'responses';
const SCAN_STORE = 'scans';

async function openCaptureDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RESPONSE_STORE)) {
        db.createObjectStore(RESPONSE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SCAN_STORE)) {
        db.createObjectStore(SCAN_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function startCaptureScan(id: string, startedAt = Date.now()): Promise<CaptureScanSummary> {
  const summary = emptyCaptureSummary(id, startedAt);
  const db = await openCaptureDatabase();
  await runWrite(db, [SCAN_STORE], (tx) => {
    tx.objectStore(SCAN_STORE).put(summary);
  });
  db.close();
  return summary;
}

export async function saveCapturedResponse(record: CapturedResponseRecord): Promise<void> {
  const db = await openCaptureDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([RESPONSE_STORE, SCAN_STORE], 'readwrite');
    const responses = tx.objectStore(RESPONSE_STORE);
    const scans = tx.objectStore(SCAN_STORE);
    const existingRequest = responses.get(record.id);

    existingRequest.onsuccess = () => {
      const scanRequest = scans.get(record.scanId);
      scanRequest.onsuccess = () => {
        const existing = scanRequest.result as CaptureScanSummary | undefined;
        if (!existing) {
          tx.abort();
          return;
        }
        responses.put(record);
        scans.put(addRecordToSummary(existing, record, !existingRequest.result));
      };
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Capture storage transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Capture scan is missing'));
  });
  db.close();
}

export async function finishCaptureScan(id: string, stoppedAt = Date.now()): Promise<void> {
  const db = await openCaptureDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SCAN_STORE, 'readwrite');
    const store = tx.objectStore(SCAN_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const summary = request.result as CaptureScanSummary | undefined;
      if (summary && summary.stoppedAt === undefined) store.put({ ...summary, stoppedAt });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export async function getCapturedResponsesForScan(scanId: string): Promise<CapturedResponseRecord[]> {
  const db = await openCaptureDatabase();
  const records = await new Promise<CapturedResponseRecord[]>((resolve, reject) => {
    const tx = db.transaction(RESPONSE_STORE, 'readonly');
    const request = tx.objectStore(RESPONSE_STORE).getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as CapturedResponseRecord[])
          .filter((record) => record.scanId === scanId)
          .sort(
            (a, b) =>
              a.meta.capturedAt - b.meta.capturedAt ||
              a.meta.requestId.localeCompare(b.meta.requestId),
          ),
      );
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}

export async function getCaptureScan(id: string): Promise<CaptureScanSummary | null> {
  const db = await openCaptureDatabase();
  const summary = await new Promise<CaptureScanSummary | null>((resolve, reject) => {
    const tx = db.transaction(SCAN_STORE, 'readonly');
    const request = tx.objectStore(SCAN_STORE).get(id);
    request.onsuccess = () => resolve((request.result as CaptureScanSummary | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return summary;
}

export async function getLatestCaptureScan(): Promise<CaptureScanSummary | null> {
  const scans = await getAllCaptureScans();
  scans.sort((a, b) => b.startedAt - a.startedAt);
  return scans[0] ?? null;
}

export async function getLatestCompletedCaptureScan(): Promise<CaptureScanSummary | null> {
  return selectLatestCompletedScan(await getAllCaptureScans());
}

export function selectLatestCompletedScan(scans: CaptureScanSummary[]): CaptureScanSummary | null {
  return [...scans]
    .filter((scan) => scan.stoppedAt !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

async function getAllCaptureScans(): Promise<CaptureScanSummary[]> {
  const db = await openCaptureDatabase();
  const scans = await new Promise<CaptureScanSummary[]>((resolve, reject) => {
    const tx = db.transaction(SCAN_STORE, 'readonly');
    const request = tx.objectStore(SCAN_STORE).getAll();
    request.onsuccess = () => resolve(request.result as CaptureScanSummary[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return scans;
}

async function runWrite(
  db: IDBDatabase,
  stores: string[],
  operation: (tx: IDBTransaction) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    operation(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
