import type {
  AccountSnapshot,
  ConsumableCount,
  DataQuality,
  SnapshotQuality,
  TicketCount,
  WeaponStashSnapshot,
} from '../types/account.ts';

export const ACCOUNT_DATABASE_VERSION = 1 as const;
export type AccountFamily = keyof SnapshotQuality;

export interface AccountDatabaseState {
  version: typeof ACCOUNT_DATABASE_VERSION;
  snapshot: AccountSnapshot;
  observedAt: Partial<Record<AccountFamily, number>>;
}

export function createAccountDatabase(snapshot: AccountSnapshot): AccountDatabaseState {
  return {
    version: ACCOUNT_DATABASE_VERSION,
    snapshot: cloneSnapshot(snapshot),
    observedAt: observedTimes(snapshot),
  };
}

export function mergeAccountDatabase(
  current: AccountDatabaseState | null,
  incoming: AccountSnapshot,
): AccountDatabaseState {
  if (!current) return createAccountDatabase(incoming);

  const quality = { ...current.snapshot.quality };
  const observedAt = { ...current.observedAt };
  const next: AccountSnapshot = {
    ...current.snapshot,
    quality,
    capturedAt: Math.max(current.snapshot.capturedAt, incoming.capturedAt),
    characters: current.snapshot.characters,
    weapons: current.snapshot.weapons,
    summons: current.snapshot.summons,
    artifacts: current.snapshot.artifacts,
    weaponStashes: mergeStashes(current.snapshot.weaponStashes, incoming.weaponStashes, incoming.capturedAt),
    treasures: current.snapshot.treasures,
    consumables: current.snapshot.consumables,
    tickets: current.snapshot.tickets,
    progression: current.snapshot.progression,
    accountStatus: current.snapshot.accountStatus,
  };

  applyCollection(current, incoming, next, observedAt, quality, 'characters', 'characters', (value) => value.id);
  applyCollection(current, incoming, next, observedAt, quality, 'weapons', 'weapons', (value) => value.id);
  applyCollection(current, incoming, next, observedAt, quality, 'summons', 'summons', (value) => value.id);
  applyCollection(current, incoming, next, observedAt, quality, 'artifacts', 'artifacts', (value) => value.id);
  applyCollection(current, incoming, next, observedAt, quality, 'treasures', 'treasures', (value) => value.itemId);
  applyCollection(current, incoming, next, observedAt, quality, 'consumables', 'consumables', consumableKey);
  applyCollection(current, incoming, next, observedAt, quality, 'tickets', 'tickets', ticketKey);
  applyCollection(current, incoming, next, observedAt, quality, 'progression', 'progression', (value) => value.key);

  applyAccountStatus(current, incoming, next, observedAt, quality);

  return { version: ACCOUNT_DATABASE_VERSION, snapshot: next, observedAt };
}

function applyCollection<
  K extends 'characters' | 'weapons' | 'summons' | 'artifacts' | 'treasures' | 'consumables' | 'tickets' | 'progression',
>(
  current: AccountDatabaseState,
  incoming: AccountSnapshot,
  next: AccountSnapshot,
  observedAt: Partial<Record<AccountFamily, number>>,
  quality: SnapshotQuality,
  family: AccountFamily,
  key: K,
  identity: (value: AccountSnapshot[K][number]) => string,
): void {
  const incomingQuality = incoming.quality[family];
  if (incomingQuality === 'unknown') return;
  const incomingAt = incoming.capturedAt;
  const currentAt = observedAt[family] ?? 0;
  if (!shouldApply(currentAt, quality[family], incomingAt, incomingQuality)) return;

  const incomingValues = incoming[key] as AccountSnapshot[K];
  const currentValues = current.snapshot[key] as AccountSnapshot[K];
  next[key] = (incomingQuality === 'known'
    ? [...incomingValues]
    : mergeValues(currentValues, incomingValues, identity)) as AccountSnapshot[K];
  quality[family] = incomingQuality;
  observedAt[family] = incomingAt;
}

function applyAccountStatus(
  current: AccountDatabaseState,
  incoming: AccountSnapshot,
  next: AccountSnapshot,
  observedAt: Partial<Record<AccountFamily, number>>,
  quality: SnapshotQuality,
): void {
  const family: AccountFamily = 'accountStatus';
  const incomingQuality = incoming.quality.accountStatus;
  if (incomingQuality === 'unknown') return;
  const incomingAt = incoming.capturedAt;
  const currentAt = observedAt.accountStatus ?? 0;
  if (!shouldApply(currentAt, quality.accountStatus, incomingAt, incomingQuality)) return;

  const status = incoming.accountStatus;
  if (status && (!current.snapshot.accountStatus || status.updatedAt >= current.snapshot.accountStatus.updatedAt)) {
    next.accountStatus = { ...status };
  }
  quality.accountStatus = incomingQuality;
  observedAt.accountStatus = incomingAt;
}

function shouldApply(
  currentAt: number,
  currentQuality: DataQuality,
  incomingAt: number,
  incomingQuality: DataQuality,
): boolean {
  if (incomingAt > currentAt) return true;
  if (incomingAt < currentAt) return false;
  return qualityRank(incomingQuality) >= qualityRank(currentQuality);
}

function qualityRank(value: DataQuality): number {
  if (value === 'known') return 2;
  if (value === 'partial') return 1;
  return 0;
}

function mergeValues<T extends { updatedAt: number }>(
  current: readonly T[],
  incoming: readonly T[],
  identity: (value: T) => string,
): T[] {
  const merged = new Map<string, T>();
  for (const value of current) merged.set(identity(value), value);
  for (const value of incoming) {
    const key = identity(value);
    const existing = merged.get(key);
    if (!existing || value.updatedAt >= existing.updatedAt) merged.set(key, value);
  }
  return [...merged.values()];
}

function mergeStashes(
  current: readonly WeaponStashSnapshot[],
  incoming: readonly WeaponStashSnapshot[],
  incomingCapturedAt: number,
): WeaponStashSnapshot[] {
  const merged = new Map(current.map((stash) => [stash.stashId, stash]));
  for (const stash of incoming) {
    const existing = merged.get(stash.stashId);
    if (!existing) {
      merged.set(stash.stashId, cloneStash(stash));
      continue;
    }
    const existingAt = newestWeaponTime(existing) ?? 0;
    const incomingAt = newestWeaponTime(stash) ?? incomingCapturedAt;
    if (incomingAt < existingAt) continue;
    merged.set(stash.stashId, {
      stashId: stash.stashId,
      quality: stash.quality,
      weapons: stash.quality === 'known'
        ? [...stash.weapons]
        : mergeValues(existing.weapons, stash.weapons, (value) => value.id),
    });
  }
  return [...merged.values()];
}

function newestWeaponTime(stash: WeaponStashSnapshot): number | undefined {
  if (stash.weapons.length === 0) return undefined;
  return Math.max(...stash.weapons.map((weapon) => weapon.updatedAt));
}

function consumableKey(value: ConsumableCount): string {
  return `${value.group}:${value.itemKindId ?? ''}:${value.itemId}`;
}

function ticketKey(value: TicketCount): string {
  return `${value.group}:${value.itemKindId ?? ''}:${value.itemId}`;
}

function observedTimes(snapshot: AccountSnapshot): Partial<Record<AccountFamily, number>> {
  const times: Partial<Record<AccountFamily, number>> = {};
  for (const family of Object.keys(snapshot.quality) as AccountFamily[]) {
    if (snapshot.quality[family] !== 'unknown') times[family] = snapshot.capturedAt;
  }
  return times;
}

function cloneSnapshot(snapshot: AccountSnapshot): AccountSnapshot {
  return {
    ...snapshot,
    quality: { ...snapshot.quality },
    characters: [...snapshot.characters],
    weapons: [...snapshot.weapons],
    summons: [...snapshot.summons],
    artifacts: [...snapshot.artifacts],
    weaponStashes: snapshot.weaponStashes.map(cloneStash),
    treasures: [...snapshot.treasures],
    consumables: [...snapshot.consumables],
    tickets: [...snapshot.tickets],
    progression: [...snapshot.progression],
    accountStatus: snapshot.accountStatus ? { ...snapshot.accountStatus } : undefined,
  };
}

function cloneStash(stash: WeaponStashSnapshot): WeaponStashSnapshot {
  return { ...stash, weapons: [...stash.weapons] };
}
