import type { CapturedResponseRecord } from '../capture/types.ts';
import { parseRaidParseExport } from './export.ts';
import {
  capturedRaidLocalId,
  combatRaidKey,
  isTerminalRaid,
  manualFinalizeRaid,
  observedFinalizeRaid,
  selectCombatContextKey,
} from './lifecycle.ts';
import { mergeCombatObservation, parseCombatObservation } from './parser.ts';
import {
  isVerifiedCombatResponseUrl,
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatActorContext,
  type CombatParseContext,
  type CombatParticipantDisplay,
  type CombatSummonContext,
  type VerifiedCombatObservation,
} from './complete-observation.ts';
import type { NormalizedRaidParse, RaidDropPreferences, RaidHistoryRecord } from './types.ts';
import { enrichVerifiedScenarioSemantics, preserveVerifiedNormalFacts } from './verified-combat-semantics.ts';
import { enrichObservedActorVisuals, retainActorVisualId } from './visual-context.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';
const LEGACY_LATEST_KEY = 'latest';
const LEGACY_CONTEXT_KEY = 'gbfit:combat-context';
const CONTEXT_STATE_KEY = 'gbfit:combat-context-state-v2';

interface ActiveRow { key: string; parse: NormalizedRaidParse; }
interface CombatContextState {
  currentKey?: string;
  contexts: Record<string, CombatParseContext>;
  manualFinalizedKeys: Record<string, true>;
}

export interface ActiveCombatRaid {
  key: string;
  parse: NormalizedRaidParse;
  context?: CombatParseContext;
}

// Background reads this immediately after ingest for compatibility with older
// callers. Extension pages run in a separate JS context and fall back to stored active state.
let lastIngestedContext: CombatParseContext | undefined;

export async function ingestCapturedCombatRecord(
  record: CapturedResponseRecord,
  preferredInstanceId?: string | null,
): Promise<NormalizedRaidParse | null> {
  if (isVerifiedCombatResponseUrl(record.meta.url)) {
    return await ingestVerifiedCombatRecord(record, preferredInstanceId);
  }

  lastIngestedContext = undefined;
  const observation = parseCombatObservation(record);
  if (!observation) return null;
  const current = (await getActiveCombatRaids())[0];
  const next = mergeCombatObservation(current?.parse ?? null, observation);
  const logTurn = latestLogTurn(next);
  if (logTurn !== undefined) next.lastObservedTurn = Math.max(next.lastObservedTurn ?? 0, logTurn);
  const key = current?.key ?? combatRaidKey(next.raidTechnicalId, next.instanceId);

  if (isTerminalRaid(next)) {
    const terminal = observedFinalizeRaid(next);
    await upsertCapturedHistory(terminal);
    await deleteActive(key);
    return terminal;
  }
  await saveActive(key, next);
  return next;
}

async function ingestVerifiedCombatRecord(
  record: CapturedResponseRecord,
  preferredInstanceId?: string | null,
): Promise<NormalizedRaidParse | null> {
  const state = await getCombatContextState();
  const routed = await routeVerifiedObservation(record, state, preferredInstanceId);
  if (!routed) return null;

  const { key, observation, startObserved } = routed;
  enrichObservedActorVisuals(record, observation.context);
  lastIngestedContext = observation.context ? sanitizeCombatParseContext(observation.context) : undefined;

  const activeCurrent = await getActiveParseByKey(key);
  const capturedCurrent = !activeCurrent && (observation.context?.instanceId || state.manualFinalizedKeys[key])
    ? await getCapturedHistoryForIdentity(observation.context?.instanceId, observation.raidTechnicalId)
    : undefined;
  const current = activeCurrent ?? capturedCurrent ?? null;
  const next = mergeVerifiedMultiraidObservation(current, observation);
  next.instanceId = observation.context?.instanceId ?? current?.instanceId;
  preserveVerifiedNormalFacts(next, observation.actions);
  if (observation.observedTurn !== undefined) {
    next.lastObservedTurn = Math.max(next.lastObservedTurn ?? 0, observation.observedTurn);
  }

  if (observation.context) state.contexts[key] = sanitizeCombatParseContext(observation.context);
  if (startObserved) {
    state.currentKey = key;
    if (state.manualFinalizedKeys[key]) {
      delete state.manualFinalizedKeys[key];
      delete next.finalization;
      delete next.finalizedAt;
      await deleteCapturedHistoryForIdentity(next.instanceId, next.raidTechnicalId);
    }
  }

  if (isTerminalRaid(next)) {
    const terminal = observedFinalizeRaid(next);
    await upsertCapturedHistory(terminal);
    await deleteActive(key);
    delete state.manualFinalizedKeys[key];
    if (state.currentKey === key) state.currentKey = undefined;
    await saveCombatContextState(state);
    return terminal;
  }

  if (state.manualFinalizedKeys[key]) {
    const finalizedAt = capturedCurrent?.finalizedAt ?? next.lastObservedAt;
    const manual = manualFinalizeRaid(next, finalizedAt);
    await upsertCapturedHistory(manual);
    await saveCombatContextState(state);
    return manual;
  }

  await saveActive(key, next);
  await saveCombatContextState(state);
  return next;
}

async function routeVerifiedObservation(
  record: CapturedResponseRecord,
  state: CombatContextState,
  preferredInstanceId?: string | null,
): Promise<{ key: string; observation: VerifiedCombatObservation; startObserved: boolean } | null> {
  if (isVerifiedStart(record.meta.url)) {
    const probe = parseVerifiedMultiraidObservation(record);
    if (!probe?.context) return null;
    const key = combatRaidKey(probe.context.raidTechnicalId, probe.context.instanceId);
    const previous = state.contexts[key];
    const observation = previous ? parseVerifiedMultiraidObservation(record, previous) ?? probe : probe;
    enrichVerifiedScenarioSemantics(record.body, observation);
    const turn = directlyObservedTurn(record);
    return {
      key,
      observation: turn === undefined ? observation : { ...observation, observedTurn: turn },
      startObserved: true,
    };
  }

  const directInstanceId = observedInstanceId(record);
  let key = selectCombatContextKey(state.contexts, state.currentKey, directInstanceId, preferredInstanceId);
  let context = key ? state.contexts[key] : undefined;
  const scopedInstanceId = directInstanceId ?? (preferredInstanceId === null ? undefined : preferredInstanceId);

  if (!context && scopedInstanceId) {
    const active = (await getActiveCombatRaids()).find((entry) => entry.parse.instanceId === scopedInstanceId);
    if (active) {
      key = active.key;
      context = active.context ?? minimalContext(active.parse);
    }
  } else if (!context && preferredInstanceId !== null && !scopedInstanceId && state.currentKey) {
    const active = await getActiveParseByKey(state.currentKey);
    if (active) {
      key = state.currentKey;
      context = minimalContext(active);
    }
  }

  if (!key || !context) return null;
  const observation = parseVerifiedMultiraidObservation(record, context);
  if (!observation) return null;
  enrichVerifiedScenarioSemantics(record.body, observation);
  return { key, observation, startObserved: false };
}

export async function getActiveCombatRaids(): Promise<ActiveCombatRaid[]> {
  const [rows, state] = await Promise.all([getActiveRows(), getCombatContextState()]);
  const deduped = new Map<string, ActiveCombatRaid>();

  for (const row of rows) {
    let parse = row.parse;
    let key = row.key;
    if (key === LEGACY_LATEST_KEY) {
      const legacyContext = Object.values(state.contexts).find((context) => context.raidTechnicalId === parse.raidTechnicalId);
      if (legacyContext?.instanceId && !parse.instanceId) parse = { ...parse, instanceId: legacyContext.instanceId };
      key = combatRaidKey(parse.raidTechnicalId, parse.instanceId);
    }
    const context = state.contexts[key]
      ?? Object.values(state.contexts).find((candidate) => Boolean(parse.instanceId) && candidate.instanceId === parse.instanceId);
    const candidate: ActiveCombatRaid = { key, parse, context };
    const existing = deduped.get(key);
    if (!existing || parse.lastObservedAt >= existing.parse.lastObservedAt) deduped.set(key, candidate);
  }

  return [...deduped.values()].sort((a, b) => b.parse.lastObservedAt - a.parse.lastObservedAt);
}

export async function getLatestCombatParse(): Promise<NormalizedRaidParse | null> {
  return (await getActiveCombatRaids())[0]?.parse ?? null;
}

export async function getCombatLiveContext(): Promise<CombatParseContext | undefined> {
  if (lastIngestedContext) return lastIngestedContext;
  return (await getActiveCombatRaids())[0]?.context;
}

export async function clearCombatParseContext(): Promise<void> {
  lastIngestedContext = undefined;
  await chrome.storage.session.remove([LEGACY_CONTEXT_KEY, CONTEXT_STATE_KEY]);
}

export async function manualFinalizeActiveRaid(
  key: string,
  finalizedAt = Date.now(),
): Promise<RaidHistoryRecord | null> {
  const raid = await getActiveParseByKey(key);
  if (!raid) return null;
  const finalized = manualFinalizeRaid(raid, finalizedAt);
  const record = await upsertCapturedHistory(finalized);
  await deleteActive(key);

  const state = await getCombatContextState();
  state.manualFinalizedKeys[key] = true;
  // If this was the currently played raid, retain that proven routing key for
  // delayed packets. A later start for another raid replaces currentKey.
  state.currentKey ??= key;
  await saveCombatContextState(state);
  return record;
}

async function getCombatContextState(): Promise<CombatContextState> {
  const stored = await chrome.storage.session.get([CONTEXT_STATE_KEY, LEGACY_CONTEXT_KEY]);
  const existing = stored[CONTEXT_STATE_KEY] as CombatContextState | undefined;
  if (existing && existing.contexts && typeof existing.contexts === 'object') return sanitizeContextState(existing);

  const legacy = stored[LEGACY_CONTEXT_KEY] as CombatParseContext | undefined;
  if (!legacy?.raidTechnicalId) return emptyContextState();
  const context = sanitizeCombatParseContext(legacy);
  const key = combatRaidKey(context.raidTechnicalId, context.instanceId);
  const migrated: CombatContextState = { currentKey: key, contexts: { [key]: context }, manualFinalizedKeys: {} };
  await saveCombatContextState(migrated);
  await chrome.storage.session.remove(LEGACY_CONTEXT_KEY);
  return migrated;
}

async function saveCombatContextState(state: CombatContextState): Promise<void> {
  await chrome.storage.session.set({ [CONTEXT_STATE_KEY]: sanitizeContextState(state) });
}

function sanitizeContextState(state: CombatContextState): CombatContextState {
  const contexts: Record<string, CombatParseContext> = {};
  for (const [key, context] of Object.entries(state.contexts ?? {})) {
    if (context?.raidTechnicalId) contexts[key] = sanitizeCombatParseContext(context);
  }
  const manualFinalizedKeys: Record<string, true> = {};
  for (const key of Object.keys(state.manualFinalizedKeys ?? {})) manualFinalizedKeys[key] = true;
  return {
    currentKey: state.currentKey && contexts[state.currentKey] ? state.currentKey : undefined,
    contexts,
    manualFinalizedKeys,
  };
}

function emptyContextState(): CombatContextState {
  return { contexts: {}, manualFinalizedKeys: {} };
}

function sanitizeCombatParseContext(context: CombatParseContext): CombatParseContext {
  return {
    raidTechnicalId: context.raidTechnicalId,
    instanceId: safeText(context.instanceId, 120),
    actorSlots: context.actorSlots.map(sanitizeActorContext),
    actors: context.actors?.map(sanitizeActorContext),
    mainCharacterId: safeText(context.mainCharacterId, 80),
    accountDisplayName: safeText(context.accountDisplayName, 80),
    turn: safeNumber(context.turn),
    summons: context.summons?.slice(0, 6).map(sanitizeSummonContext),
    participants: context.participants?.slice(0, 30).map(sanitizeParticipantDisplay),
  };
}

function sanitizeActorContext(actor: CombatActorContext): CombatActorContext {
  return retainActorVisualId(actor, {
    id: actor.id,
    name: actor.id && /^30[234]\d{7}$/.test(actor.id) ? actor.name : undefined,
    hp: safeNumber(actor.hp),
    maxHp: safeNumber(actor.maxHp),
    alive: typeof actor.alive === 'boolean' ? actor.alive : undefined,
  });
}

function sanitizeSummonContext(summon: CombatSummonContext): CombatSummonContext {
  return {
    id: safeText(summon.id, 80),
    name: safeText(summon.name, 120),
    cooldown: safeNumber(summon.cooldown),
    available: typeof summon.available === 'boolean' ? summon.available : undefined,
    used: typeof summon.used === 'boolean' ? summon.used : undefined,
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

function safeText(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function directlyObservedTurn(record: CapturedResponseRecord): number | undefined {
  if (!isVerifiedStart(record.meta.url)) return undefined;
  const body = record.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const value = (body as Record<string, unknown>).turn;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function observedInstanceId(record: CapturedResponseRecord): string | undefined {
  try {
    const result = /^\/resultmulti\/content\/index\/([^/]+)\/?$/.exec(new URL(record.meta.url).pathname)?.[1];
    if (result) return result;
  } catch {
    return undefined;
  }
  const body = record.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return safeText((body as Record<string, unknown>).raid_id, 120);
}

function isVerifiedStart(url: string): boolean {
  try {
    return new URL(url).pathname === '/rest/multiraid/start.json';
  } catch {
    return false;
  }
}

function minimalContext(parse: NormalizedRaidParse): CombatParseContext {
  return { raidTechnicalId: parse.raidTechnicalId, instanceId: parse.instanceId, actorSlots: [], actors: [], turn: parse.lastObservedTurn };
}

function latestLogTurn(parse: NormalizedRaidParse): number | undefined {
  const turns = parse.log.flatMap((entry) => entry.turn === undefined ? [] : [entry.turn]);
  return turns.length ? Math.max(...turns) : undefined;
}

export async function getRaidHistory(): Promise<RaidHistoryRecord[]> {
  const db = await openCombatDatabase();
  const values = await requestValue<RaidHistoryRecord[]>(db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAll());
  db.close();
  return values.sort((a, b) =>
    (b.observedEndedAt ?? b.finalizedAt ?? b.lastObservedAt) - (a.observedEndedAt ?? a.finalizedAt ?? a.lastObservedAt),
  );
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
  await transactionDone(db.transaction([ACTIVE_STORE, HISTORY_STORE, PREFS_STORE], 'readwrite'), (tx) => {
    tx.objectStore(ACTIVE_STORE).clear();
    tx.objectStore(HISTORY_STORE).clear();
    tx.objectStore(PREFS_STORE).clear();
  });
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
  const record: RaidHistoryRecord = { ...parse, localId: `import:${crypto.randomUUID()}`, source: 'imported', favorite: false };
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(HISTORY_STORE, 'readwrite'), (tx) => tx.objectStore(HISTORY_STORE).put(record));
  db.close();
  return record;
}

async function getActiveRows(): Promise<ActiveRow[]> {
  const db = await openCombatDatabase();
  const values = await requestValue<ActiveRow[]>(db.transaction(ACTIVE_STORE, 'readonly').objectStore(ACTIVE_STORE).getAll());
  db.close();
  return values;
}

async function getActiveParseByKey(key: string): Promise<NormalizedRaidParse | null> {
  return (await getActiveCombatRaids()).find((entry) => entry.key === key)?.parse ?? null;
}

async function saveActive(key: string, parse: NormalizedRaidParse): Promise<void> {
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(ACTIVE_STORE, 'readwrite'), (tx) => {
    tx.objectStore(ACTIVE_STORE).put({ key, parse } satisfies ActiveRow);
  });
  db.close();
}

async function deleteActive(key: string): Promise<void> {
  const [rows, state] = await Promise.all([getActiveRows(), getCombatContextState()]);
  const legacy = rows.find((row) => row.key === LEGACY_LATEST_KEY);
  let deleteLegacy = false;
  if (legacy) {
    let parse = legacy.parse;
    const context = Object.values(state.contexts).find((candidate) => candidate.raidTechnicalId === parse.raidTechnicalId);
    if (context?.instanceId && !parse.instanceId) parse = { ...parse, instanceId: context.instanceId };
    deleteLegacy = combatRaidKey(parse.raidTechnicalId, parse.instanceId) === key;
  }

  const db = await openCombatDatabase();
  await transactionDone(db.transaction(ACTIVE_STORE, 'readwrite'), (tx) => {
    const store = tx.objectStore(ACTIVE_STORE);
    store.delete(key);
    if (deleteLegacy) store.delete(LEGACY_LATEST_KEY);
  });
  db.close();
}

async function getCapturedHistoryForIdentity(
  instanceId: string | undefined,
  raidTechnicalId: string,
): Promise<RaidHistoryRecord | undefined> {
  const db = await openCombatDatabase();
  if (instanceId) {
    const value = await requestValue<RaidHistoryRecord | undefined>(
      db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(`capture:${instanceId}`),
    );
    db.close();
    return value;
  }
  const values = await requestValue<RaidHistoryRecord[]>(db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).getAll());
  db.close();
  return values
    .filter((entry) => entry.source === 'captured' && entry.raidTechnicalId === raidTechnicalId)
    .sort((a, b) => b.lastObservedAt - a.lastObservedAt)[0];
}

async function deleteCapturedHistoryForIdentity(instanceId: string | undefined, raidTechnicalId: string): Promise<void> {
  const current = await getCapturedHistoryForIdentity(instanceId, raidTechnicalId);
  if (!current || current.finalization !== 'manual') return;
  const db = await openCombatDatabase();
  await transactionDone(db.transaction(HISTORY_STORE, 'readwrite'), (tx) => tx.objectStore(HISTORY_STORE).delete(current.localId));
  db.close();
}

async function upsertCapturedHistory(parse: NormalizedRaidParse): Promise<RaidHistoryRecord> {
  const localId = capturedRaidLocalId(parse);
  const db = await openCombatDatabase();
  let saved: RaidHistoryRecord | undefined;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, 'readwrite');
    const store = tx.objectStore(HISTORY_STORE);
    const request = store.get(localId);
    request.onsuccess = () => {
      const current = request.result as RaidHistoryRecord | undefined;
      saved = {
        ...parse,
        localId,
        source: 'captured',
        favorite: current?.favorite ?? false,
        note: current?.note,
      };
      store.put(saved);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
  if (!saved) throw new Error('Could not persist captured raid history');
  return saved;
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

async function transactionDone(tx: IDBTransaction, operation: (tx: IDBTransaction) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    operation(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}