import type { CapturedResponseRecord } from '../capture/types.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';
import { isVerifiedPartyDeckResponseUrl } from './loadout.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';

type Obj = Record<string, unknown>;
type ActiveRow = { key: string; parse: NormalizedRaidParse & { loadout?: RaidLoadoutSnapshot } };
type HistoryRow = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

export interface ObservedDeckJob {
  deckId: string;
  jobId?: string;
  jobName?: string;
  observedAt: number;
}

export function normalizeObservedDeckJob(record: CapturedResponseRecord): ObservedDeckJob | null {
  if (!isVerifiedPartyDeckResponseUrl(record.meta.url) || !obj(record.body) || !obj(record.body.deck)) return null;
  const deck = record.body.deck;
  const pc = obj(deck.pc) ? deck.pc : undefined;
  const job = pc && obj(pc.job) ? pc.job : undefined;
  const master = job && obj(job.master) ? job.master : undefined;
  const deckId = safeText(deck.priority, 40);
  if (!deckId || !master) return null;
  const jobId = safeText(master.id, 80);
  const jobName = safeText(master.name, 120);
  return jobId || jobName ? { deckId, jobId, jobName, observedAt: record.meta.capturedAt } : null;
}

export async function persistObservedDeckJob(record: CapturedResponseRecord): Promise<void> {
  const observed = normalizeObservedDeckJob(record);
  if (!observed) return;
  const db = await openCombatDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readwrite');
    patchStore<ActiveRow>(tx.objectStore(ACTIVE_STORE), (row) => {
      const next = withObservedJob(row.parse, observed);
      return next === row.parse ? row : { ...row, parse: next };
    });
    patchStore<HistoryRow>(tx.objectStore(HISTORY_STORE), (row) => withObservedJob(row, observed) as HistoryRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

export function withObservedJob<T extends NormalizedRaidParse & { loadout?: RaidLoadoutSnapshot }>(
  parse: T,
  observed: ObservedDeckJob,
): T {
  const loadout = parse.loadout;
  if (
    !loadout
    || loadout.deckId !== observed.deckId
    || loadout.updatedAt !== observed.observedAt
    || (loadout.jobId && loadout.jobName)
  ) return parse;
  return {
    ...parse,
    loadout: {
      ...loadout,
      jobId: loadout.jobId ?? observed.jobId,
      jobName: loadout.jobName ?? observed.jobName,
      updatedAt: Math.max(loadout.updatedAt, observed.observedAt),
    },
  };
}

function patchStore<T>(store: IDBObjectStore, transform: (value: T) => T): void {
  const request = store.getAll();
  request.onsuccess = () => {
    for (const value of request.result as T[]) {
      const next = transform(value);
      if (next !== value) store.put(next);
    }
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

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, maxLength);
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
