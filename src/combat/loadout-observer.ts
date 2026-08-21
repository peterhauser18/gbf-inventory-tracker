import { mergeAccountDatabase } from '../account/database.ts';
import { normalizePartyDeckAccountSnapshot } from '../account/party-deck.ts';
import { loadAccountDatabase, saveAccountDatabase } from '../account/storage.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import type { DataQuality } from '../types/account.ts';
import {
  enrichRaidLoadout,
  ingestObservedLoadoutRecord as ingestCoreObservedLoadoutRecord,
  isVerifiedPartyDeckResponseUrl,
  loadoutSignaturesMatch,
  normalizeBattleStartLoadout,
  normalizePartyDeckLoadout,
  selectMatchingDeck,
} from './loadout.ts';
import type { RaidLoadoutSnapshot, RaidWeaponSkillSnapshot } from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

export const PERSISTED_DECK_CACHE_KEY = 'gbfit:combat-loadout-cache:v1';
const CACHE_SESSION_KEY = 'gbfit:combat-loadout-cache-session:v1';
const MAX_PERSISTED_DECKS = 20;
const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';

type Obj = Record<string, unknown>;
type ActiveRow = { key: string; parse: NormalizedRaidParse };

type CacheSessionState = {
  scanId: string;
  raidInstanceIds: string[];
  freshDecks: Record<string, RaidLoadoutSnapshot>;
};

export interface LoadoutCacheStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

let partyAccountQueue: Promise<void> = Promise.resolve();

export async function ingestObservedLoadoutRecord(record: CapturedResponseRecord): Promise<void> {
  if (isVerifiedPartyDeckResponseUrl(record.meta.url)) {
    const deck = normalizePartyDeckLoadout(record.body, record.meta.capturedAt);

    await ingestCoreObservedLoadoutRecord(record);

    if (deck?.deckId) {
      try {
        await rememberFreshDeck(record.scanId, deck);
      } catch {
        // Session provenance is optional; core late enrichment still remains available.
      }
      try {
        await persistObservedDeck(deck);
      } catch {
        // Cached deck reuse is optional; fresh session enrichment remains available.
      }
      try {
        await applyFreshDeckToCurrentScan(record.scanId, deck);
      } catch {
        // Fresh cache replacement must not interrupt passive observation.
      }
    }

    await queuePartyAccountEnrichment(record.body, record.meta.capturedAt);
    return;
  }

  const start = normalizeBattleStartLoadout(record.body, record.meta.capturedAt);
  const instanceId = observedBattleInstanceId(record.body);

  await ingestCoreObservedLoadoutRecord(record);

  if (!start || !instanceId || !isVerifiedBattleStartResponseUrl(record.meta.url)) return;
  await rememberRaidInstance(record.scanId, instanceId);

  const session = await readCacheSessionState(record.scanId);
  const freshMatches = Object.values(session.freshDecks)
    .filter((deck) => loadoutSignaturesMatch(start.signature, deck.signature));
  if (freshMatches.length === 1) {
    const fresh = freshMatches[0]!;
    await updateStoredRaidLoadouts(new Set([instanceId]), (loadout) =>
      mergeDeckObservationIntoRaid(loadout, fresh, 'observed'));
    return;
  }
  if (freshMatches.length > 1) return;

  let cached: RaidLoadoutSnapshot[];
  try {
    cached = await readPersistedDecks();
  } catch {
    return;
  }
  const candidate = selectMatchingDeck(start.signature, cached);
  if (!candidate) return;

  await updateStoredRaidLoadouts(new Set([instanceId]), (loadout) =>
    mergeDeckObservationIntoRaid(loadout, candidate, 'cached'));
}

export function minimizePersistedDeck(deck: RaidLoadoutSnapshot): RaidLoadoutSnapshot {
  const observedAt = deck.weaponGridObservedAt ?? deck.observedAt;
  return {
    quality: strongerQuality(deck.weaponGridQuality, deck.calculator.quality),
    observedAt,
    updatedAt: deck.updatedAt,
    correlation: 'signature',
    deckId: deck.deckId,
    signature: {
      npcIds: [...deck.signature.npcIds],
      summonIds: [...deck.signature.summonIds],
      mainWeaponId: deck.signature.mainWeaponId,
    },
    partyQuality: 'unknown',
    party: [],
    summonQuality: 'unknown',
    summons: [],
    mainWeaponId: deck.mainWeaponId,
    weaponGridQuality: deck.weaponGridQuality,
    weaponGridSource: deck.weaponGridQuality === 'unknown' ? undefined : 'cached',
    weaponGridObservedAt: deck.weaponGridQuality === 'unknown' ? undefined : observedAt,
    weapons: deck.weapons.map((weapon) => ({ ...weapon })),
    additionalWeaponsActive: deck.additionalWeaponsActive,
    calculator: cloneCalculator(deck.calculator),
  };
}

export async function readPersistedDecks(area?: LoadoutCacheStorageArea): Promise<RaidLoadoutSnapshot[]> {
  const storage = area ?? chromeLocalStorage();
  const result = await storage.get(PERSISTED_DECK_CACHE_KEY);
  const value = result[PERSISTED_DECK_CACHE_KEY];
  if (!obj(value)) return [];
  return Object.values(value)
    .filter(isStoredDeck)
    .map((deck) => minimizePersistedDeck(deck));
}

export async function persistObservedDeck(
  deck: RaidLoadoutSnapshot,
  area?: LoadoutCacheStorageArea,
): Promise<void> {
  if (!deck.deckId) return;
  const storage = area ?? chromeLocalStorage();
  const result = await storage.get(PERSISTED_DECK_CACHE_KEY);
  const raw = result[PERSISTED_DECK_CACHE_KEY];
  const current = obj(raw) ? raw : {};
  const decks: Record<string, RaidLoadoutSnapshot> = {};
  for (const [key, value] of Object.entries(current)) {
    if (isStoredDeck(value)) decks[key] = value;
  }
  decks[deck.deckId] = minimizePersistedDeck(deck);
  const bounded = Object.fromEntries(
    Object.entries(decks)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_PERSISTED_DECKS),
  );
  await storage.set({ [PERSISTED_DECK_CACHE_KEY]: bounded });
}

export function mergeDeckObservationIntoRaid(
  base: RaidLoadoutSnapshot,
  deck: RaidLoadoutSnapshot,
  source: 'cached' | 'observed',
): RaidLoadoutSnapshot {
  if (!loadoutSignaturesMatch(base.signature, deck.signature)) return base;

  if (source === 'cached') {
    const enriched = enrichRaidLoadout(base, deck);
    const usedGrid = deck.weaponGridQuality !== 'unknown' && enriched.weapons === deck.weapons;
    if (!usedGrid && enriched.calculator === base.calculator) return enriched;
    return {
      ...enriched,
      // A deck id inferred only from a historical signature must not block a later fresh deck observation.
      deckId: base.deckId,
      weaponGridSource: usedGrid ? 'cached' : base.weaponGridSource,
      weaponGridObservedAt: usedGrid
        ? (deck.weaponGridObservedAt ?? deck.observedAt)
        : base.weaponGridObservedAt,
    };
  }

  let next = enrichRaidLoadout(base, deck);
  const useFreshGrid = shouldUseFreshGrid(base, deck);
  const useFreshCalculator = shouldUseFreshCalculator(base, deck);
  if (useFreshGrid) {
    next = {
      ...next,
      quality: strongerQuality(next.quality, deck.quality),
      updatedAt: Math.max(next.updatedAt, deck.updatedAt),
      deckId: base.deckId ?? deck.deckId,
      mainWeaponId: base.mainWeaponId ?? deck.mainWeaponId,
      jobId: base.jobId ?? deck.jobId,
      jobName: base.jobName ?? deck.jobName,
      weaponGridQuality: deck.weaponGridQuality,
      weaponGridSource: 'observed',
      weaponGridObservedAt: deck.weaponGridObservedAt ?? deck.observedAt,
      weapons: deck.weapons,
      additionalWeaponsActive: deck.additionalWeaponsActive,
    };
  } else if (
    base.weaponGridSource === undefined &&
    deck.weaponGridQuality !== 'unknown' &&
    sameGrid(base, deck)
  ) {
    next = {
      ...next,
      weaponGridSource: 'observed',
      weaponGridObservedAt: deck.weaponGridObservedAt ?? deck.observedAt,
    };
  }
  if (useFreshCalculator) next = { ...next, calculator: deck.calculator };
  return next;
}

async function applyFreshDeckToCurrentScan(scanId: string, deck: RaidLoadoutSnapshot): Promise<void> {
  const state = await readCacheSessionState(scanId);
  if (!state.raidInstanceIds.length) return;
  await updateStoredRaidLoadouts(new Set(state.raidInstanceIds), (loadout) =>
    mergeDeckObservationIntoRaid(loadout, deck, 'observed'));
}

async function queuePartyAccountEnrichment(body: unknown, capturedAt: number): Promise<void> {
  const snapshot = normalizePartyDeckAccountSnapshot(body, capturedAt);
  if (!snapshot) return;
  partyAccountQueue = partyAccountQueue
    .catch(() => {})
    .then(async () => {
      const current = await loadAccountDatabase();
      await saveAccountDatabase(mergeAccountDatabase(current, snapshot));
    });
  try {
    await partyAccountQueue;
  } catch {
    // Dashboard enrichment is optional and must not interrupt the core passive observer.
  }
}

async function rememberFreshDeck(scanId: string, deck: RaidLoadoutSnapshot): Promise<void> {
  if (!deck.deckId) return;
  const state = await readCacheSessionState(scanId);
  const observed = minimizePersistedDeck(deck);
  observed.weaponGridSource = observed.weaponGridQuality === 'unknown' ? undefined : 'observed';
  state.freshDecks[deck.deckId] = observed;
  const entries = Object.entries(state.freshDecks)
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_PERSISTED_DECKS);
  state.freshDecks = Object.fromEntries(entries);
  await chrome.storage.session.set({ [CACHE_SESSION_KEY]: state });
}

async function rememberRaidInstance(scanId: string, instanceId: string): Promise<void> {
  try {
    const state = await readCacheSessionState(scanId);
    if (!state.raidInstanceIds.includes(instanceId)) state.raidInstanceIds.push(instanceId);
    await chrome.storage.session.set({ [CACHE_SESSION_KEY]: state });
  } catch {
    // Session scoping only limits fresh late-enrichment; cached start enrichment still works.
  }
}

async function readCacheSessionState(scanId: string): Promise<CacheSessionState> {
  try {
    const stored = await chrome.storage.session.get(CACHE_SESSION_KEY);
    const state = stored[CACHE_SESSION_KEY] as CacheSessionState | undefined;
    if (state?.scanId === scanId && Array.isArray(state.raidInstanceIds)) {
      return { ...state, freshDecks: obj(state.freshDecks) ? state.freshDecks : {} };
    }
  } catch {
    // Fall back to an empty session scope.
  }
  return { scanId, raidInstanceIds: [], freshDecks: {} };
}

async function updateStoredRaidLoadouts(
  instanceIds: ReadonlySet<string>,
  transform: (loadout: RaidLoadoutSnapshot) => RaidLoadoutSnapshot,
): Promise<void> {
  if (!instanceIds.size) return;
  const db = await openCombatDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readwrite');
    const active = tx.objectStore(ACTIVE_STORE);
    const history = tx.objectStore(HISTORY_STORE);

    const activeRequest = active.getAll();
    activeRequest.onsuccess = () => {
      for (const row of activeRequest.result as ActiveRow[]) {
        if (!row.parse.instanceId || !instanceIds.has(row.parse.instanceId) || !row.parse.loadout) continue;
        const loadout = transform(row.parse.loadout);
        if (loadout !== row.parse.loadout) active.put({ ...row, parse: { ...row.parse, loadout } });
      }
    };

    const historyRequest = history.getAll();
    historyRequest.onsuccess = () => {
      for (const row of historyRequest.result as RaidHistoryRecord[]) {
        if (!row.instanceId || !instanceIds.has(row.instanceId) || !row.loadout) continue;
        const loadout = transform(row.loadout);
        if (loadout !== row.loadout) history.put({ ...row, loadout });
      }
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
      if (!db.objectStoreNames.contains(ACTIVE_STORE)) db.createObjectStore(ACTIVE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'localId' });
      if (!db.objectStoreNames.contains(PREFS_STORE)) db.createObjectStore(PREFS_STORE, { keyPath: 'raidTechnicalId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function shouldUseFreshGrid(base: RaidLoadoutSnapshot, deck: RaidLoadoutSnapshot): boolean {
  if (deck.weaponGridQuality === 'unknown') return false;
  const incomingObservedAt = deck.weaponGridObservedAt ?? deck.observedAt;
  if (
    base.weaponGridSource === 'observed' &&
    base.weaponGridObservedAt !== undefined &&
    incomingObservedAt < base.weaponGridObservedAt
  ) return false;
  return qualityRank(deck.weaponGridQuality) >= qualityRank(base.weaponGridQuality);
}

function shouldUseFreshCalculator(base: RaidLoadoutSnapshot, deck: RaidLoadoutSnapshot): boolean {
  if (deck.calculator.quality === 'unknown') return false;
  if (deck.updatedAt < base.updatedAt && base.weaponGridSource === 'observed') return false;
  return qualityRank(deck.calculator.quality) >= qualityRank(base.calculator.quality);
}

function sameGrid(left: RaidLoadoutSnapshot, right: RaidLoadoutSnapshot): boolean {
  if (left.weaponGridQuality !== right.weaponGridQuality || left.weapons.length !== right.weapons.length) return false;
  return left.weapons.every((weapon, index) => {
    const other = right.weapons[index];
    return other?.slot === weapon.slot && other.masterId === weapon.masterId;
  });
}

function cloneCalculator(value: RaidWeaponSkillSnapshot): RaidWeaponSkillSnapshot {
  return {
    ...value,
    enhancement: { ...value.enhancement },
    boosts: value.boosts.map((boost) => ({ ...boost })),
  };
}

function isStoredDeck(value: unknown): value is RaidLoadoutSnapshot {
  return obj(value)
    && obj(value.signature)
    && Array.isArray(value.signature.npcIds)
    && Array.isArray(value.signature.summonIds)
    && Array.isArray(value.weapons)
    && obj(value.calculator)
    && typeof value.updatedAt === 'number';
}

function strongerQuality(left: DataQuality, right: DataQuality): DataQuality {
  return qualityRank(right) > qualityRank(left) ? right : left;
}

function qualityRank(value: DataQuality): number {
  if (value === 'known') return 2;
  if (value === 'partial') return 1;
  return 0;
}

function observedBattleInstanceId(body: unknown): string | undefined {
  if (!obj(body)) return undefined;
  const value = body.raid_id;
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isVerifiedBattleStartResponseUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return path === '/rest/multiraid/start.json' || path === '/rest/raid/start.json';
  } catch {
    return false;
  }
}

function chromeLocalStorage(): LoadoutCacheStorageArea {
  return chrome.storage.local as unknown as LoadoutCacheStorageArea;
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
