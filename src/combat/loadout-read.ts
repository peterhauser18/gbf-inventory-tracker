import type { RaidLoadoutSignature, RaidLoadoutSnapshot } from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';
const DECK_STATE_KEY = 'gbfit:combat-loadout-decks:v1';

type ActiveRow = { key: string; parse: NormalizedRaidParse & { loadout?: RaidLoadoutSnapshot } };
type HistoryRow = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };
type DeckObservationState = { decks?: Record<string, RaidLoadoutSnapshot> };

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

  const observedDecks = await readObservedDecks();
  return {
    active: new Map(activeRows.map((row) => [row.key, resolveObservedLoadout(row.parse.loadout, observedDecks)])),
    history: new Map(historyRows.map((row) => [row.localId, resolveObservedLoadout(row.loadout, observedDecks)])),
  };
}

export function resolveObservedLoadout(
  base: RaidLoadoutSnapshot | undefined,
  decks: readonly RaidLoadoutSnapshot[],
): RaidLoadoutSnapshot | undefined {
  if (!base || !decks.length) return base;

  const candidate = selectUniqueMatchingDeck(base, decks);
  if (!candidate) return base;

  const useGrid = isStrongerGrid(base, candidate);
  const useCalculator = qualityRank(candidate.calculator.quality) > qualityRank(base.calculator.quality);
  if (!useGrid && !useCalculator) return base;

  return {
    ...base,
    quality: qualityRank(candidate.quality) > qualityRank(base.quality) ? candidate.quality : base.quality,
    updatedAt: Math.max(base.updatedAt, candidate.updatedAt),
    correlation: 'signature',
    deckId: base.deckId ?? candidate.deckId,
    jobId: base.jobId ?? candidate.jobId,
    jobName: base.jobName ?? candidate.jobName,
    weaponGridQuality: useGrid ? candidate.weaponGridQuality : base.weaponGridQuality,
    weapons: useGrid ? candidate.weapons : base.weapons,
    additionalWeaponsActive: useGrid ? candidate.additionalWeaponsActive : base.additionalWeaponsActive,
    calculator: useCalculator ? candidate.calculator : base.calculator,
  };
}

function selectUniqueMatchingDeck(
  base: RaidLoadoutSnapshot,
  decks: readonly RaidLoadoutSnapshot[],
): RaidLoadoutSnapshot | undefined {
  const exact = decks.filter((deck) => strictSignatureMatch(base.signature, deck.signature));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;

  // Battle-start weapon identity can represent the displayed weapon skin rather than
  // the equipped grid weapon. Only relax that one field, and only when all five
  // characters and all five own summons still match in order and identify one deck.
  const skinTolerant = decks.filter((deck) => partyAndSummonsMatch(base.signature, deck.signature));
  return skinTolerant.length === 1 ? skinTolerant[0] : undefined;
}

function strictSignatureMatch(left: RaidLoadoutSignature, right: RaidLoadoutSignature): boolean {
  return Boolean(left.mainWeaponId)
    && left.mainWeaponId === right.mainWeaponId
    && partyAndSummonsMatch(left, right);
}

function partyAndSummonsMatch(left: RaidLoadoutSignature, right: RaidLoadoutSignature): boolean {
  return left.npcIds.length === 5
    && right.npcIds.length === 5
    && sameOrdered(left.npcIds, right.npcIds)
    && left.summonIds.length === 5
    && right.summonIds.length === 5
    && sameOrdered(left.summonIds, right.summonIds);
}

function isStrongerGrid(base: RaidLoadoutSnapshot, candidate: RaidLoadoutSnapshot): boolean {
  const incomingRank = qualityRank(candidate.weaponGridQuality);
  const currentRank = qualityRank(base.weaponGridQuality);
  if (incomingRank > currentRank) return true;
  return incomingRank === currentRank
    && incomingRank > 0
    && candidate.weapons.length > base.weapons.length;
}

function qualityRank(value: string): number {
  if (value === 'known') return 2;
  if (value === 'partial') return 1;
  return 0;
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function readObservedDecks(): Promise<RaidLoadoutSnapshot[]> {
  try {
    const stored = await chrome.storage.session.get(DECK_STATE_KEY);
    const state = stored[DECK_STATE_KEY] as DeckObservationState | undefined;
    return state?.decks ? Object.values(state.decks) : [];
  } catch {
    return [];
  }
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
