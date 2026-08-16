import type { CapturedResponseRecord } from '../capture/types.ts';
import { parseRaidParseExport } from './export.ts';
import { mergeCombatObservation, parseCombatObservation } from './parser.ts';
import {
  isVerifiedCombatResponseUrl,
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatActorContext,
  type CombatParseContext,
  type CombatParticipantDisplay,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import type { NormalizedRaidParse, RaidDropPreferences, RaidHistoryRecord } from './types.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const LATEST_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';
const LATEST_KEY = 'latest';
const CONTEXT_KEY = 'gbfit:combat-context';

interface LatestRow { key: typeof LATEST_KEY; parse: NormalizedRaidParse; }

export async function ingestCapturedCombatRecord(record: CapturedResponseRecord): Promise<NormalizedRaidParse | null> {
  const current = await getLatestCombatParse();
  if (isVerifiedCombatResponseUrl(record.meta.url)) {
    const context = await getCombatParseContext();
    const parsed = parseVerifiedMultiraidObservation(record, context);
    if (!parsed) return null;
    const turn = directlyObservedTurn(record);
    const parsedWithTurn: VerifiedCombatObservation = turn === undefined ? parsed : { ...parsed, observedTurn: turn };
    const observation: VerifiedCombatObservation = !context && parsedWithTurn.context
      ? { ...parsedWithTurn, forceNewRaid: true }
      : parsedWithTurn;
    const next = mergeVerifiedMultiraidObservation(current, observation);
    if (observation.observedTurn !== undefined) {
      next.lastObservedTurn = Math.max(next.lastObservedTurn ?? 0, observation.observedTurn);
    }
    await saveLatest(next);
    if (observation.context) await saveCombatParseContext(sanitizeCombatParseContext(observation.context));
    if (isTerminal(next.result)) await upsertCapturedHistory(next);
    return next;
  }
  const observation = parseCombatObservation(record);
  if (!observation) return null;
  const next = mergeCombatObservation(current, observation);
  const logTurn = latestLogTurn(next);
  if (logTurn !== undefined) next.lastObservedTurn = Math.max(next.lastObservedTurn ?? 0, logTurn);
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

export async function getCombatLiveContext(): Promise<CombatParseContext | undefined> {
  const context = await getCombatParseContext();
  return context ? sanitizeCombatParseContext(context) : undefined;
}

export async function clearCombatParseContext(): Promise<void> {
  await chrome.storage.session.remove(CONTEXT_KEY);
}

async function getCombatParseContext(): Promise<CombatParseContext | undefined> {
  const stored = await chrome.storage.session.get(CONTEXT_KEY);
  return stored[CONTEXT_KEY] as CombatParseContext | undefined;
}

async function saveCombatParseContext(context: CombatParseContext): Promise<void> {
  await chrome.storage.session.set({ [CONTEXT_KEY]: context });
}

function sanitizeCombatParseContext(context: CombatParseContext): CombatParseContext {
  return {
    raidTechnicalId: context.raidTechnicalId,
    instanceId: context.instanceId,
    actorSlots: context.actorSlots.map(sanitizeActorContext),
    actors: context.actors?.map(sanitizeActorContext),
    participants: context.participants?.slice(0, 30).map(sanitizeParticipantDisplay),
  };
}

function sanitizeActorContext(actor: CombatActorContext): CombatActorContext {
  return {
    id: actor.id,
    name: actor.id && /^30[234]\d{7}$/.test(actor.id) ? actor.name : undefined,
    hp: safeNumber(actor.hp),
    maxHp: safeNumber(actor.maxHp),
    alive: typeof actor.alive === 'boolean' ? actor.alive : undefined,
  };
}

function sanitizeParticipantDisplay(participant: CombatParticipantDisplay): CombatParticipantDisplay {
  return {
    name: participant.name.slice(0, 80),
    placement: safeNumber(participant.placement),
    level: safeNumber(participant.level),
    honors: safeNumber(participant.honors),
    host: typeof participant.host === 'boolean' ? participant.host : undefined,
    hpPercent: safeNumber(participant.hpPercent),
    status: participant.status === 'active' || participant.status === 'dead' || participant.status === 'retired'
      ? participant.status
      : undefined,
  };
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function directlyObservedTurn(record: CapturedResponseRecord): number | undefined {
  try {
    if (new URL(record.meta.url).pathname !== '/rest/multiraid/start.json') return undefined;
  } catch {
    return undefined;
  }
  const body = record.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>).turn;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function latestLogTurn(parse: NormalizedRaidParse): number | undefined {
  const turns = parse.log.flatMap((entry) => entry.turn === undefined ? [] : [entry.turn]);
  return turns.length ? Math.max(...turns) : undefined;
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

export async function clearCombatStorage(): Promise<void> {
  await clearCombatParseContext();
  const db = await openCombatDatabase();
  await transactionDone(
    db.transaction([LATEST_STORE, HISTORY_STORE, PREFS_STORE], 'readwrite'),
    (tx) => {
      tx.objectStore(LATEST_STORE).clear();
      tx.objectStore(HISTORY_STORE).clear();
      tx.objectStore(PREFS_STORE).clear();
    },
  );
  db.close();
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
