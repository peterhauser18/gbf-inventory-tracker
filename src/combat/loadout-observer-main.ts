import type { CapturedResponseRecord } from '../capture/types.ts';
import type { DataQuality } from '../types/account.ts';
import {
  enrichRaidLoadout,
  ingestObservedLoadoutRecord as ingestCoreObservedLoadoutRecord,
  isVerifiedPartyDeckResponseUrl,
  loadoutSignaturesMatch,
  normalizePartyDeckLoadout,
  selectMatchingDeck,
} from './loadout.ts';
import {
  ingestObservedLoadoutRecord as ingestPartyInventoryAndCacheRecord,
  readPersistedDecks,
} from './loadout-observer.ts';
import type { RaidLoadoutSnapshot, RaidWeaponSkillSnapshot } from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

const CACHE_SESSION_KEY = 'gbfit:combat-loadout-main-integration:v1';
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
};

export async function ingestObservedLoadoutRecord(record: CapturedResponseRecord): Promise<void> {
  if (isVerifiedPartyDeckResponseUrl(record.meta.url)) {
    const deck = normalizePartyDeckLoadout(record.body, record.meta.capturedAt);

    // Reuse the existing #125 path for account enrichment and bounded persistent cache updates.
    // It also delegates to the current core loadout observer, so #136 deck-id correlation remains authoritative.
    await ingestPartyInventoryAndCacheRecord(record);

    if (deck?.deckId) {
      try {
        await applyObservedDeckToCurrentScan(record.scanId, deck);
      } catch {
        // Provenance decoration is optional; core late enrichment remains authoritative.
      }
    }
    return;
  }

  if (!isVerifiedBattleStartResponseUrl(record.meta.url)) {
    await ingestCoreObservedLoadoutRecord(record);
    return;
  }

  const instanceId = observedBattleInstanceId(record.body);
  await ingestCoreObservedLoadoutRecord(record);
  if (!instanceId) return;

  try {
    await rememberRaidInstance(record.scanId, instanceId);
  } catch {
    // Session scoping only limits later provenance refresh.
  }

  let base: RaidLoadoutSnapshot | undefined;
  let cached: RaidLoadoutSnapshot[];
  try {
    base = await readStoredRaidLoadout(instanceId);
    cached = await readPersistedDecks();
  } catch {
    return;
  }
  if (!base) return;

  const candidate = selectCachedDeckForRaid(base, cached);
  if (!candidate) return;

  const source = base.weaponGridQuality === 'unknown' ? 'cached' : 'observed';
  await updateStoredRaidLoadouts(new Set([instanceId]), (loadout) =>
    mergeDeckEvidenceIntoRaid(loadout, candidate, source));
}

export function selectCachedDeckForRaid(
  raid: RaidLoadoutSnapshot,
  decks: readonly RaidLoadoutSnapshot[],
): RaidLoadoutSnapshot | undefined {
  if (raid.deckId) return decks.find((deck) => deck.deckId === raid.deckId);
  return selectMatchingDeck(raid.signature, decks);
}

export function mergeDeckEvidenceIntoRaid(
  base: RaidLoadoutSnapshot,
  deck: RaidLoadoutSnapshot,
  source: 'cached' | 'observed',
): RaidLoadoutSnapshot {
  const exactDeckId = Boolean(base.deckId && deck.deckId && base.deckId === deck.deckId);
  if (base.deckId && deck.deckId && base.deckId !== deck.deckId) return base;
  if (!exactDeckId && !loadoutSignaturesMatch(base.signature, deck.signature)) return base;

  if (source === 'cached') {
    const enriched = enrichRaidLoadout(base, deck);
    const usedIncomingGrid = deck.weaponGridQuality !== 'unknown' && enriched.weapons === deck.weapons;
    if (!usedIncomingGrid) return enriched;
    return {
      ...enriched,
      // Historical signature matching must never invent a deck id. An id already observed by #136 is retained.
      deckId: base.deckId,
      weaponGridSource: 'cached',
      weaponGridObservedAt: deck.weaponGridObservedAt ?? deck.observedAt,
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
      correlation: exactDeckId ? 'deck-id' : next.correlation,
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
    deck.weaponGridQuality !== 'unknown'
    && sameGrid(base, deck)
    && base.weaponGridSource !== 'observed'
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

async function applyObservedDeckToCurrentScan(scanId: string, deck: RaidLoadoutSnapshot): Promise<void> {
  const state = await readCacheSessionState(scanId);
  if (!state.raidInstanceIds.length) return;
  await updateStoredRaidLoadouts(new Set(state.raidInstanceIds), (loadout) =>
    mergeDeckEvidenceIntoRaid(loadout, deck, 'observed'));
}

async function rememberRaidInstance(scanId: string, instanceId: string): Promise<void> {
  const state = await readCacheSessionState(scanId);
  if (!state.raidInstanceIds.includes(instanceId)) state.raidInstanceIds.push(instanceId);
  await chrome.storage.session.set({ [CACHE_SESSION_KEY]: state });
}

async function readCacheSessionState(scanId: string): Promise<CacheSessionState> {
  try {
    const stored = await chrome.storage.session.get(CACHE_SESSION_KEY);
    const state = stored[CACHE_SESSION_KEY] as CacheSessionState | undefined;
    if (state?.scanId === scanId && Array.isArray(state.raidInstanceIds)) return state;
  } catch {
    // Fall back to an empty session scope.
  }
  return { scanId, raidInstanceIds: [] };
}

async function readStoredRaidLoadout(instanceId: string): Promise<RaidLoadoutSnapshot | undefined> {
  const db = await openCombatDatabase();
  const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readonly');
  const [activeRows, historyRows] = await Promise.all([
    requestValue<ActiveRow[]>(tx.objectStore(ACTIVE_STORE).getAll()),
    requestValue<RaidHistoryRecord[]>(tx.objectStore(HISTORY_STORE).getAll()),
  ]);
  db.close();

  const active = activeRows.find((row) => row.parse.instanceId === instanceId)?.parse.loadout;
  if (active) return active;
  return historyRows.find((row) => row.instanceId === instanceId)?.loadout;
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

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function shouldUseFreshGrid(base: RaidLoadoutSnapshot, deck: RaidLoadoutSnapshot): boolean {
  if (deck.weaponGridQuality === 'unknown') return false;
  const incomingObservedAt = deck.weaponGridObservedAt ?? deck.observedAt;
  if (base.weaponGridObservedAt !== undefined && incomingObservedAt < base.weaponGridObservedAt) return false;
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
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return false;
    return parsed.pathname === '/rest/multiraid/start.json' || parsed.pathname === '/rest/raid/start.json';
  } catch {
    return false;
  }
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
