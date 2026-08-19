import type { CapturedResponseRecord } from '../capture/types.ts';
import type { DataQuality } from '../types/account.ts';
import type {
  RaidLoadoutMember,
  RaidLoadoutSignature,
  RaidLoadoutSnapshot,
  RaidLoadoutSummon,
  RaidLoadoutWeapon,
  RaidWeaponSkillBoost,
  RaidWeaponSkillSnapshot,
} from './loadout-types.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

declare module './types.ts' {
  interface NormalizedRaidParse {
    loadout?: RaidLoadoutSnapshot;
  }
}

const DECK_STATE_KEY = 'gbfit:combat-loadout-decks:v1';
const MAX_OBSERVED_DECKS = 20;
const DB_NAME = 'gbf-inventory-tracker-combat';
const DB_VERSION = 1;
const ACTIVE_STORE = 'latest';
const HISTORY_STORE = 'history';
const PREFS_STORE = 'preferences';

type Obj = Record<string, unknown>;
type ActiveRow = { key: string; parse: NormalizedRaidParse };

type DeckObservationState = {
  scanId: string;
  decks: Record<string, RaidLoadoutSnapshot>;
  raidInstanceIds: string[];
};

export interface LateEnrichmentRaid {
  instanceId?: string;
  lastObservedAt: number;
  loadout?: RaidLoadoutSnapshot;
  active: boolean;
}

export function isVerifiedPartyDeckResponseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'game.granbluefantasy.jp'
      && parsed.pathname === '/party/deck';
  } catch {
    return false;
  }
}

export async function ingestObservedLoadoutRecord(record: CapturedResponseRecord): Promise<void> {
  if (isVerifiedPartyDeckResponseUrl(record.meta.url)) {
    const deck = normalizePartyDeckLoadout(record.body, record.meta.capturedAt);
    if (!deck?.deckId) return;
    const state = await currentDeckState(record.scanId);
    state.decks[deck.deckId] = deck;
    trimDecks(state);
    await saveDeckState(state);
    await enrichObservedRaids(state);
    return;
  }

  if (!isVerifiedBattleStartResponseUrl(record.meta.url)) return;
  const seeded = normalizeBattleStartLoadout(record.body, record.meta.capturedAt);
  const instanceId = observedBattleInstanceId(record.body);
  if (!seeded || !instanceId) return;

  const state = await currentDeckState(record.scanId);
  if (!state.raidInstanceIds.includes(instanceId)) state.raidInstanceIds.push(instanceId);
  await saveDeckState(state);
  const candidate = selectMatchingDeck(seeded.signature, Object.values(state.decks));
  const enriched = candidate ? enrichRaidLoadout(seeded, candidate) : seeded;
  await updateStoredRaidLoadouts((parse) => {
    if (parse.instanceId !== instanceId) return parse;
    return { ...parse, loadout: mergeRaidLoadout(parse.loadout, enriched) };
  });
}

export function normalizeBattleStartLoadout(body: unknown, observedAt: number): RaidLoadoutSnapshot | null {
  if (!obj(body)) return null;
  const player = obj(body.player) ? body.player : undefined;
  const rawMembers = player && Array.isArray(player.param) ? player.param : [];
  const formation = new Set(arrayText(body.formation));
  const hasFormation = formation.size > 0;
  const party: RaidLoadoutMember[] = [];
  const npcIds: string[] = [];

  rawMembers.forEach((value, index) => {
    if (!obj(value)) return;
    const npcId = index === 0 ? undefined : characterMasterId(value);
    if (index > 0 && npcId) npcIds.push(npcId);
    party.push({
      position: index,
      id: npcId,
      name: index === 0 ? 'MC' : safeText(value.name, 120),
      frontline: hasFormation ? formation.has(String(index)) : index < 4,
    });
  });

  const ownSummons = Array.isArray(body.summon) ? body.summon : [];
  const summons: RaidLoadoutSummon[] = [];
  const summonIds: string[] = [];
  ownSummons.forEach((value, index) => {
    if (!obj(value)) return;
    const id = safeText(value.id, 80) ?? safeText(value.image_id, 80);
    if (id) summonIds.push(id);
    summons.push({ position: index, id, name: safeText(value.name, 120), support: false });
  });
  if (obj(body.supporter)) {
    summons.push({
      position: summons.length,
      id: safeText(body.supporter.id, 80) ?? safeText(body.supporter.image_id, 80),
      name: safeText(body.supporter.name, 120),
      support: true,
    });
  }

  const weapon = obj(body.weapon) ? body.weapon : undefined;
  const mainWeaponId = safeText(weapon?.weapon, 80);
  const auxiliaryWeaponId = safeText(weapon?.weapon2, 80);
  const jobId = observedOwnJobId(body);
  const partyQuality = listQuality(party.length, 6);
  const summonQuality = ownSummons.length >= 5 && summons.some((summon) => summon.support) ? 'known' : summons.length ? 'partial' : 'unknown';

  return {
    quality: party.length || summons.length || mainWeaponId ? 'partial' : 'unknown',
    observedAt,
    updatedAt: observedAt,
    correlation: 'battle-start',
    signature: { npcIds, summonIds, mainWeaponId },
    partyQuality,
    party,
    summonQuality,
    summons,
    mainWeaponId,
    auxiliaryWeaponId,
    jobId,
    weaponGridQuality: 'unknown',
    weapons: [],
    calculator: unknownCalculator(),
  };
}

export function normalizePartyDeckLoadout(body: unknown, observedAt: number): RaidLoadoutSnapshot | null {
  if (!obj(body) || !obj(body.deck)) return null;
  const deck = body.deck;
  const pc = obj(deck.pc) ? deck.pc : undefined;
  if (!pc) return null;
  const deckId = safeText(deck.priority, 40);
  if (!deckId) return null;

  const weaponMap = obj(pc.weapons) ? pc.weapons : undefined;
  const weapons = normalizeWeapons(weaponMap);
  const additionalWeaponsActive = bool(pc.is_use_additional_weapon) ?? bool(pc.is_open_additional_weapon);
  const expectedSlots = additionalWeaponsActive ? 13 : 10;
  const completeGrid = weapons.length >= expectedSlots
    && Array.from({ length: expectedSlots }, (_, index) => index + 1)
      .every((slot) => weapons.some((weapon) => weapon.slot === slot && Boolean(weapon.masterId)));
  const weaponGridQuality: DataQuality = completeGrid ? 'known' : weapons.length ? 'partial' : 'unknown';

  const npcIds = orderedObjectValues(deck.npc)
    .map((value) => obj(value) ? safeText(at(value, 'master', 'id'), 80) : undefined)
    .filter(present);
  const ownSummonValues = orderedObjectValues(pc.summons);
  const summonIds = ownSummonValues
    .map((value) => obj(value) ? safeText(at(value, 'master', 'id'), 80) ?? safeText(at(value, 'param', 'image_id'), 80) : undefined)
    .filter(present);
  const mainWeaponId = weapons.find((weapon) => weapon.slot === 1)?.masterId;
  const calculator = normalizeCalculator(pc.damage_info);
  const party = normalizeDeckParty(deck.npc);
  const summons = normalizeDeckSummons(pc.summons);
  const job = obj(pc.job) && obj(pc.job.master) ? pc.job.master : undefined;
  const jobId = safeText(job?.id, 80);
  const jobName = safeText(job?.name, 120);
  const partyQuality = listQuality(party.length, 5);
  const summonQuality = listQuality(summons.length, 5);
  const quality = strongestQuality(weaponGridQuality, calculator.quality, partyQuality, summonQuality);

  return {
    quality,
    observedAt,
    updatedAt: observedAt,
    correlation: 'signature',
    deckId,
    signature: { npcIds, summonIds, mainWeaponId },
    partyQuality,
    party,
    summonQuality,
    summons,
    mainWeaponId,
    jobId,
    jobName,
    weaponGridQuality,
    weapons,
    additionalWeaponsActive,
    calculator,
  };
}

export function selectMatchingDeck(
  signature: RaidLoadoutSignature,
  decks: readonly RaidLoadoutSnapshot[],
): RaidLoadoutSnapshot | undefined {
  const matches = decks.filter((deck) => loadoutSignaturesMatch(signature, deck.signature));
  return matches.length === 1 ? matches[0] : undefined;
}

export function loadoutSignaturesMatch(left: RaidLoadoutSignature, right: RaidLoadoutSignature): boolean {
  if (!left.mainWeaponId || !right.mainWeaponId || left.mainWeaponId !== right.mainWeaponId) return false;
  if (left.npcIds.length !== 5 || right.npcIds.length !== 5 || !sameOrdered(left.npcIds, right.npcIds)) return false;
  if (left.summonIds.length !== 5 || right.summonIds.length !== 5 || !sameOrdered(left.summonIds, right.summonIds)) return false;
  return true;
}

export function enrichRaidLoadout(base: RaidLoadoutSnapshot, deck: RaidLoadoutSnapshot): RaidLoadoutSnapshot {
  if (!loadoutSignaturesMatch(base.signature, deck.signature)) return base;
  if (base.deckId && deck.deckId && base.deckId !== deck.deckId) return base;

  const useGrid = shouldUseIncomingGrid(base, deck);
  const useCalculator = shouldUseIncomingCalculator(base.calculator, deck.calculator);
  return {
    ...base,
    quality: strongestQuality(base.quality, deck.quality),
    updatedAt: Math.max(base.updatedAt, deck.updatedAt),
    correlation: 'signature',
    deckId: base.deckId ?? deck.deckId,
    mainWeaponId: base.mainWeaponId ?? deck.mainWeaponId,
    jobId: base.jobId ?? deck.jobId,
    jobName: base.jobName ?? deck.jobName,
    weaponGridQuality: useGrid ? deck.weaponGridQuality : base.weaponGridQuality,
    weapons: useGrid ? deck.weapons : base.weapons,
    additionalWeaponsActive: useGrid ? deck.additionalWeaponsActive : base.additionalWeaponsActive,
    calculator: useCalculator ? deck.calculator : base.calculator,
  };
}

export function mergeRaidLoadout(
  current: RaidLoadoutSnapshot | undefined,
  incoming: RaidLoadoutSnapshot,
): RaidLoadoutSnapshot {
  if (!current) return incoming;
  if (loadoutSignaturesMatch(current.signature, incoming.signature)) {
    const party = preferList(current.partyQuality, current.party.length, incoming.partyQuality, incoming.party.length)
      ? incoming.party
      : current.party;
    const summons = preferList(current.summonQuality, current.summons.length, incoming.summonQuality, incoming.summons.length)
      ? incoming.summons
      : current.summons;
    const merged: RaidLoadoutSnapshot = {
      ...current,
      quality: strongestQuality(current.quality, incoming.quality),
      updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
      partyQuality: strongerQuality(current.partyQuality, incoming.partyQuality),
      party,
      summonQuality: strongerQuality(current.summonQuality, incoming.summonQuality),
      summons,
      mainWeaponId: current.mainWeaponId ?? incoming.mainWeaponId,
      auxiliaryWeaponId: current.auxiliaryWeaponId ?? incoming.auxiliaryWeaponId,
      jobId: current.jobId ?? incoming.jobId,
      jobName: current.jobName ?? incoming.jobName,
    };
    return enrichRaidLoadout(merged, incoming);
  }
  return current;
}

export async function readActiveRaidLoadout(key: string): Promise<RaidLoadoutSnapshot | undefined> {
  const db = await openCombatDatabase();
  const row = await requestValue<ActiveRow | undefined>(db.transaction(ACTIVE_STORE, 'readonly').objectStore(ACTIVE_STORE).get(key));
  db.close();
  return row?.parse.loadout;
}

export async function readHistoryRaidLoadout(localId: string): Promise<RaidLoadoutSnapshot | undefined> {
  const db = await openCombatDatabase();
  const row = await requestValue<RaidHistoryRecord | undefined>(db.transaction(HISTORY_STORE, 'readonly').objectStore(HISTORY_STORE).get(localId));
  db.close();
  return row?.loadout;
}

export function selectLateEnrichmentDecks(
  rows: readonly LateEnrichmentRaid[],
  decks: readonly RaidLoadoutSnapshot[],
): Map<string, RaidLoadoutSnapshot> {
  const latestByInstance = new Map<string, LateEnrichmentRaid>();
  for (const row of rows) {
    if (!row.instanceId || !row.loadout || row.loadout.weaponGridQuality === 'known') continue;
    const existing = latestByInstance.get(row.instanceId);
    if (!existing || row.active || !existing.active && row.lastObservedAt > existing.lastObservedAt) {
      latestByInstance.set(row.instanceId, row);
    }
  }

  const candidateByInstance = new Map<string, { deck: RaidLoadoutSnapshot; active: boolean }>();
  for (const [instanceId, row] of latestByInstance) {
    if (!row.loadout) continue;
    const candidate = selectMatchingDeck(row.loadout.signature, decks);
    if (candidate?.deckId) candidateByInstance.set(instanceId, { deck: candidate, active: row.active });
  }

  const activeInstancesByDeck = new Map<string, string[]>();
  const historyInstancesByDeck = new Map<string, string[]>();
  for (const [instanceId, candidate] of candidateByInstance) {
    const deckId = candidate.deck.deckId;
    if (!deckId) continue;
    const target = candidate.active ? activeInstancesByDeck : historyInstancesByDeck;
    const instances = target.get(deckId) ?? [];
    instances.push(instanceId);
    target.set(deckId, instances);
  }

  const updates = new Map<string, RaidLoadoutSnapshot>();
  for (const [deckId, instanceIds] of activeInstancesByDeck) {
    if (instanceIds.length !== 1) continue;
    const instanceId = instanceIds[0]!;
    const candidate = candidateByInstance.get(instanceId)?.deck;
    if (candidate) updates.set(instanceId, candidate);
  }
  for (const [deckId, instanceIds] of historyInstancesByDeck) {
    if (activeInstancesByDeck.has(deckId) || instanceIds.length !== 1) continue;
    const instanceId = instanceIds[0]!;
    const candidate = candidateByInstance.get(instanceId)?.deck;
    if (candidate) updates.set(instanceId, candidate);
  }
  return updates;
}

async function enrichObservedRaids(state: DeckObservationState): Promise<void> {
  const observedInstances = new Set(state.raidInstanceIds);
  const decks = Object.values(state.decks);
  if (!observedInstances.size || !decks.length) return;

  const stored = await readStoredRaidParses();
  const rows: LateEnrichmentRaid[] = [
    ...stored.active.flatMap((parse) => parse.instanceId && observedInstances.has(parse.instanceId)
      ? [{ instanceId: parse.instanceId, lastObservedAt: parse.lastObservedAt, loadout: parse.loadout, active: true }]
      : []),
    ...stored.history.flatMap((parse) => parse.instanceId && observedInstances.has(parse.instanceId)
      ? [{ instanceId: parse.instanceId, lastObservedAt: parse.lastObservedAt, loadout: parse.loadout, active: false }]
      : []),
  ];
  const assignments = selectLateEnrichmentDecks(rows, decks);
  if (!assignments.size) return;

  await updateStoredRaidLoadouts((parse) => {
    if (!parse.instanceId || !parse.loadout) return parse;
    const candidate = assignments.get(parse.instanceId);
    if (!candidate) return parse;
    return { ...parse, loadout: mergeRaidLoadout(parse.loadout, enrichRaidLoadout(parse.loadout, candidate)) };
  });
}

async function currentDeckState(scanId: string): Promise<DeckObservationState> {
  try {
    const stored = await chrome.storage.session.get(DECK_STATE_KEY);
    const state = stored[DECK_STATE_KEY] as DeckObservationState | undefined;
    if (state?.scanId === scanId && state.decks && Array.isArray(state.raidInstanceIds)) return state;
  } catch {
    // A missing session store should only disable late correlation, not combat parsing.
  }
  return { scanId, decks: {}, raidInstanceIds: [] };
}

async function saveDeckState(state: DeckObservationState): Promise<void> {
  try {
    await chrome.storage.session.set({ [DECK_STATE_KEY]: state });
  } catch {
    // Normalized raid persistence remains authoritative if session caching is unavailable.
  }
}

function trimDecks(state: DeckObservationState): void {
  const entries = Object.entries(state.decks).sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  state.decks = Object.fromEntries(entries.slice(0, MAX_OBSERVED_DECKS));
}

async function readStoredRaidParses(): Promise<{ active: NormalizedRaidParse[]; history: RaidHistoryRecord[] }> {
  const db = await openCombatDatabase();
  const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readonly');
  const [active, history] = await Promise.all([
    requestValue<ActiveRow[]>(tx.objectStore(ACTIVE_STORE).getAll()),
    requestValue<RaidHistoryRecord[]>(tx.objectStore(HISTORY_STORE).getAll()),
  ]);
  db.close();
  return { active: active.map((row) => row.parse), history };
}

async function updateStoredRaidLoadouts(
  transform: (parse: NormalizedRaidParse) => NormalizedRaidParse,
): Promise<void> {
  const db = await openCombatDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([ACTIVE_STORE, HISTORY_STORE], 'readwrite');
    const active = tx.objectStore(ACTIVE_STORE);
    const history = tx.objectStore(HISTORY_STORE);
    const activeRequest = active.getAll();
    activeRequest.onsuccess = () => {
      for (const row of activeRequest.result as ActiveRow[]) {
        const next = transform(row.parse);
        if (next !== row.parse) active.put({ ...row, parse: next });
      }
    };
    const historyRequest = history.getAll();
    historyRequest.onsuccess = () => {
      for (const row of historyRequest.result as RaidHistoryRecord[]) {
        const next = transform(row);
        if (next !== row) history.put({ ...row, ...next });
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

function normalizeWeapons(value: Obj | undefined): RaidLoadoutWeapon[] {
  if (!value) return [];
  return Object.entries(value)
    .flatMap(([slotKey, raw]) => {
      const slot = integer(slotKey);
      if (!slot || !obj(raw)) return [];
      const master = obj(raw.master) ? raw.master : undefined;
      const param = obj(raw.param) ? raw.param : undefined;
      const masterId = safeText(master?.id, 80) ?? safeText(param?.image_id, 80);
      if (!masterId && !param) return [];
      return [{
        slot,
        masterId,
        name: safeText(master?.name, 160),
        imageId: safeText(param?.image_id, 80) ?? masterId,
        hp: nonNegativeNumber(param?.hp),
        attack: nonNegativeNumber(param?.attack),
        plus: nonNegativeNumber(param?.quality),
      } satisfies RaidLoadoutWeapon];
    })
    .sort((left, right) => left.slot - right.slot);
}

function normalizeDeckParty(value: unknown): RaidLoadoutMember[] {
  return orderedObjectValues(value).flatMap((raw, index) => {
    if (!obj(raw)) return [];
    const id = safeText(at(raw, 'master', 'id'), 80);
    return [{
      position: index + 1,
      id,
      name: safeText(at(raw, 'master', 'name'), 120),
      frontline: index < 3,
    }];
  });
}

function normalizeDeckSummons(value: unknown): RaidLoadoutSummon[] {
  return orderedObjectValues(value).flatMap((raw, index) => {
    if (!obj(raw)) return [];
    return [{
      position: index,
      id: safeText(at(raw, 'master', 'id'), 80) ?? safeText(at(raw, 'param', 'image_id'), 80),
      name: safeText(at(raw, 'master', 'name'), 120),
      support: false,
    }];
  });
}

function normalizeCalculator(value: unknown): RaidWeaponSkillSnapshot {
  if (!obj(value)) return unknownCalculator();
  const enhancementValue = obj(value.weapon_skill_enhance_param) ? value.weapon_skill_enhance_param : undefined;
  const boosts = Array.isArray(value.effect_value_info)
    ? value.effect_value_info.flatMap(normalizeBoost)
    : [];
  const snapshot: RaidWeaponSkillSnapshot = {
    quality: 'unknown',
    estimatedDamage: nonNegativeNumber(value.assumed_normal_damage),
    estimatedAdvantageDamage: nonNegativeNumber(value.assumed_advantage_damage),
    advantageAttribute: nonNegativeNumber(value.assumed_advantage_damage_attribute),
    maxHp: nonNegativeNumber(value.hp),
    enhancement: {
      normal: nonNegativeNumber(enhancementValue?.weapon_skill_enhance),
      magna: nonNegativeNumber(enhancementValue?.weapon_skill_enhance_magna),
      other: nonNegativeNumber(enhancementValue?.weapon_skill_enhance_evil),
    },
    boosts,
  };
  const majorCount = [snapshot.estimatedDamage, snapshot.estimatedAdvantageDamage, snapshot.maxHp].filter((entry) => entry !== undefined).length;
  snapshot.quality = majorCount === 3 && boosts.length > 0 ? 'known' : majorCount > 0 || boosts.length > 0 ? 'partial' : 'unknown';
  return snapshot;
}

function normalizeBoost(value: unknown): RaidWeaponSkillBoost[] {
  if (!obj(value)) return [];
  const iconId = safeText(value.icon_img, 120);
  if (!iconId) return [];
  return [{
    iconId,
    label: weaponBoostLabel(iconId),
    value: safeText(value.value, 40),
    maxed: bool(value.is_max),
  }];
}

export function weaponBoostLabel(iconId: string): string {
  const key = iconId.toLowerCase().replace(/\.png$/i, '');
  const exact: Record<string, string> = {
    '01_icon_might_01': 'Might',
    '01_icon_might_03': 'EX Might',
    '01_icon_might_04': 'EX Might Sp.',
    '01_icon_stamina_01': 'Stamina',
    '01_icon_critical': 'Crit Rate',
    '01_icon_da_rate': 'DA Rate',
    '01_icon_ta_rate': 'TA Rate',
    '03_icon_hp': 'HP',
    '02_icon_def': 'DEF',
    '03_icon_hp_dmg_2': 'HP DMG',
    '03_icon_turn_dmg_2': 'Turn DMG',
    '04_icon_dmg_cap': 'DMG Cap',
    '04_icon_dmg_cap_other': 'DMG Cap (Sp.)',
    '04_icon_arcarum_dmg_cap': 'DMG Cap (Arc)',
    '04_icon_amplify': 'DMG Amp.',
    '04_icon_elem_amplify': 'Elem. Amplify',
    '04_icon_na_dmg_cap': 'N.A. DMG Cap',
    '04_icon_normal_dmg_amp': 'N.A. Amp.',
    '04_icon_normal_dmg_amp_other': 'N.A. Amp. (Sp.)',
    '04_icon_skill_dmg_cap': 'Skill DMG Cap',
    '04_icon_skill_dmg_cap_other': 'Skill Cap (Sp.)',
    '04_icon_ability_dmg_amplify_other': 'Skill Amp. (Sp.)',
    '04_icon_dmg_supp': 'DMG Supp.',
    '04_icon_skill_dmg_supp': 'Skill DMG Supp.',
    '04_icon_ca_dmg': 'C.A. DMG',
    '04_icon_ca_dmg_cap': 'C.A. DMG Cap',
    '04_icon_ca_dmg_cap_ded': 'C.A. DMG Cap (Sp.)',
    '04_icon_cb_dmg': 'C.B. DMG',
    '04_icon_cb_dmg_cap': 'C.B. DMG Cap',
    '04_icon_cb_dmg_amplify': 'C.B. Amp.',
    '04_icon_fc_dmg_amplify': 'F.C. Amp.',
    '04_icon_ca_supp': 'C.A. Supp.',
    '04_icon_ca_gage': 'C.A. Gauge',
    '04_icon_penetrate_def': 'DEF Penetration',
  };
  if (exact[key]) return exact[key];
  const optimus = /^01_icon_([a-z]+)optimus$/.exec(key)?.[1];
  if (optimus) return `${capitalize(optimus)} Optimus`;
  const concurrent = /^01_icon_([a-z]+)_concurrent_attack$/.exec(key)?.[1];
  if (concurrent) return `${capitalize(concurrent)} Concurrent ATK`;
  const reduction = /^02_icon_([a-z]+)_reduc$/.exec(key)?.[1];
  if (reduction) return `${capitalize(reduction)} Reduction`;
  return key
    .replace(/^\d+_icon_/, '')
    .split('_')
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

function unknownCalculator(): RaidWeaponSkillSnapshot {
  return { quality: 'unknown', enhancement: {}, boosts: [] };
}

function observedOwnJobId(body: Obj): string | undefined {
  const viewerId = safeText(body.viewer_id, 80);
  if (!viewerId || !Array.isArray(body.multi_raid_member_info)) return undefined;
  for (const entry of body.multi_raid_member_info) {
    if (!obj(entry) || safeText(entry.viewer_id, 80) !== viewerId) continue;
    return safeText(entry.job_id, 80);
  }
  return undefined;
}

function characterMasterId(value: Obj): string | undefined {
  const settingId = safeText(value.setting_id, 80);
  if (settingId && /^30[234]\d{7}$/.test(settingId)) return settingId;
  const pid = safeText(value.pid, 80);
  if (pid && /^30[234]\d{7}$/.test(pid)) return pid;
  return undefined;
}

function observedBattleInstanceId(body: unknown): string | undefined {
  return obj(body) ? safeText(body.raid_id, 120) : undefined;
}

function isVerifiedBattleStartResponseUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return path === '/rest/multiraid/start.json' || path === '/rest/raid/start.json';
  } catch {
    return false;
  }
}

function shouldUseIncomingGrid(base: RaidLoadoutSnapshot, incoming: RaidLoadoutSnapshot): boolean {
  const quality = compareQuality(base.weaponGridQuality, incoming.weaponGridQuality);
  if (quality < 0) return true;
  if (quality > 0 || incoming.weaponGridQuality !== 'partial') return false;
  return gridEvidenceScore(incoming) > gridEvidenceScore(base);
}

function shouldUseIncomingCalculator(base: RaidWeaponSkillSnapshot, incoming: RaidWeaponSkillSnapshot): boolean {
  const quality = compareQuality(base.quality, incoming.quality);
  if (quality < 0) return true;
  if (quality > 0 || incoming.quality !== 'partial') return false;
  return calculatorEvidenceScore(incoming) > calculatorEvidenceScore(base);
}

function gridEvidenceScore(loadout: RaidLoadoutSnapshot): number {
  return loadout.weapons.reduce((score, weapon) => score + (weapon.masterId ? 2 : 0) + (weapon.hp !== undefined ? 1 : 0) + (weapon.attack !== undefined ? 1 : 0), 0);
}

function calculatorEvidenceScore(calculator: RaidWeaponSkillSnapshot): number {
  const major = [calculator.estimatedDamage, calculator.estimatedAdvantageDamage, calculator.maxHp, calculator.advantageAttribute]
    .filter((value) => value !== undefined).length;
  const enhancement = [calculator.enhancement.normal, calculator.enhancement.magna, calculator.enhancement.other]
    .filter((value) => value !== undefined).length;
  return major * 4 + enhancement * 2 + calculator.boosts.length;
}

function preferList(
  currentQuality: DataQuality,
  currentLength: number,
  incomingQuality: DataQuality,
  incomingLength: number,
): boolean {
  const quality = compareQuality(currentQuality, incomingQuality);
  return quality < 0 || (quality === 0 && incomingQuality === 'partial' && incomingLength > currentLength);
}

function compareQuality(left: DataQuality, right: DataQuality): number {
  const rank: Record<DataQuality, number> = { unknown: 0, partial: 1, known: 2 };
  return rank[left] - rank[right];
}

function orderedObjectValues(value: unknown): unknown[] {
  if (!obj(value)) return [];
  return Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, entry]) => entry);
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function listQuality(actual: number, expected: number): DataQuality {
  return actual >= expected ? 'known' : actual > 0 ? 'partial' : 'unknown';
}

function strongestQuality(...values: DataQuality[]): DataQuality {
  return values.reduce(strongerQuality, 'unknown' as DataQuality);
}

function strongerQuality(left: DataQuality, right: DataQuality): DataQuality {
  return compareQuality(left, right) < 0 ? right : left;
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).slice(0, maxLength);
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return undefined;
}

function arrayText(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((entry) => safeText(entry, 40) ?? []) : [];
}

function at(value: Obj, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!obj(current)) return undefined;
    current = current[key];
  }
  return current;
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function present<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function capitalize(value: string): string {
  return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}
