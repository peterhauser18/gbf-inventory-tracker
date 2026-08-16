import { normalizeCaptureScan } from '../capture/normalize.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import type {
  AccountSnapshot,
  ArtifactInstance,
  CharacterInstance,
  ConsumableCount,
  ProgressionState,
  SummonInstance,
  TicketCount,
  TreasureCount,
  WeaponInstance,
  WeaponStashSnapshot,
} from '../types/account.ts';
import { mergeAccountDatabase, type AccountDatabaseState, type AccountFamily } from './database.ts';

export type AccountEvidenceKey = AccountFamily | 'weaponStashes';

const VERIFIED_PATHS = [
  /^\/npc\/list\/\d+$/,
  /^\/weapon\/list\/\d+$/,
  /^\/summon\/list\/\d+$/,
  /^\/rest\/artifact\/list\/\d+$/,
  /^\/weapon\/container_list\/\d+\/[^/]+$/,
];

const VERIFIED_EXACT_PATHS = new Set([
  '/item/article_list_by_filter_mode',
  '/item/recovery_and_evolution_list_by_filter_mode',
  '/item/gacha_ticket_and_others_list_by_filter_mode',
  '/user/status',
]);

export function isVerifiedAccountResponseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return false;
    return VERIFIED_EXACT_PATHS.has(parsed.pathname) || VERIFIED_PATHS.some((pattern) => pattern.test(parsed.pathname));
  } catch {
    return false;
  }
}

export function accountEvidenceForVerifiedResponseUrl(url: string): AccountEvidenceKey | null {
  try {
    const path = new URL(url).pathname;
    if (/^\/npc\/list\/\d+$/.test(path)) return 'characters';
    if (/^\/weapon\/list\/\d+$/.test(path)) return 'weapons';
    if (/^\/summon\/list\/\d+$/.test(path)) return 'summons';
    if (/^\/rest\/artifact\/list\/\d+$/.test(path)) return 'artifacts';
    if (/^\/weapon\/container_list\/\d+\/[^/]+$/.test(path)) return 'weaponStashes';
    if (path === '/item/article_list_by_filter_mode') return 'treasures';
    if (path === '/item/recovery_and_evolution_list_by_filter_mode') return 'consumables';
    if (path === '/item/gacha_ticket_and_others_list_by_filter_mode') return 'tickets';
    if (path === '/user/status') return 'accountStatus';
    return null;
  } catch {
    return null;
  }
}

export function normalizeVerifiedAccountRecord(record: CapturedResponseRecord): AccountSnapshot | null {
  if (!isVerifiedAccountResponseUrl(record.meta.url)) return null;
  const fragment = normalizeCaptureScan([record]);
  if (!hasObservedData(fragment)) return null;
  return fragment;
}

export function ingestAccountRecord(
  current: AccountDatabaseState | null,
  record: CapturedResponseRecord,
): AccountDatabaseState | null {
  const fragment = normalizeVerifiedAccountRecord(record);
  if (!fragment) return current;
  if (current && !fragmentChangesAccountState(current.snapshot, fragment)) return current;
  return mergeAccountDatabase(current, fragment);
}

function fragmentChangesAccountState(current: AccountSnapshot, incoming: AccountSnapshot): boolean {
  if (collectionFamilyChanged(current, incoming, 'characters', (value) => value.id)) return true;
  if (collectionFamilyChanged(current, incoming, 'weapons', (value) => value.id)) return true;
  if (collectionFamilyChanged(current, incoming, 'summons', (value) => value.id)) return true;
  if (collectionFamilyChanged(current, incoming, 'artifacts', (value) => value.id)) return true;
  if (collectionFamilyChanged(current, incoming, 'treasures', (value) => value.itemId)) return true;
  if (collectionFamilyChanged(current, incoming, 'consumables', consumableKey)) return true;
  if (collectionFamilyChanged(current, incoming, 'tickets', ticketKey)) return true;
  if (collectionFamilyChanged(current, incoming, 'progression', (value) => value.key)) return true;

  if (incoming.quality.accountStatus !== 'unknown') {
    if (current.quality.accountStatus !== incoming.quality.accountStatus) return true;
    if (current.accountStatus?.rank !== incoming.accountStatus?.rank) return true;
  }

  return weaponStashesChanged(current.weaponStashes, incoming.weaponStashes);
}

function collectionFamilyChanged<
  K extends 'characters' | 'weapons' | 'summons' | 'artifacts' | 'treasures' | 'consumables' | 'tickets' | 'progression',
>(
  current: AccountSnapshot,
  incoming: AccountSnapshot,
  key: K,
  identity: (value: AccountSnapshot[K][number]) => string,
): boolean {
  const incomingQuality = incoming.quality[key];
  if (incomingQuality === 'unknown') return false;
  if (current.quality[key] !== incomingQuality) return true;

  const currentValues = current[key] as AccountSnapshot[K];
  const incomingValues = incoming[key] as AccountSnapshot[K];
  if (incomingQuality === 'known' && currentValues.length !== incomingValues.length) return true;

  const currentById = new Map<string, AccountSnapshot[K][number]>();
  for (const value of currentValues) currentById.set(identity(value), value);
  for (const value of incomingValues) {
    const existing = currentById.get(identity(value));
    if (!existing || !sameObservedValue(existing, value)) return true;
  }
  return false;
}

function weaponStashesChanged(
  current: readonly WeaponStashSnapshot[],
  incoming: readonly WeaponStashSnapshot[],
): boolean {
  if (incoming.length === 0) return false;
  const currentById = new Map(current.map((stash) => [stash.stashId, stash]));
  for (const stash of incoming) {
    const existing = currentById.get(stash.stashId);
    if (!existing || existing.quality !== stash.quality) return true;
    if (stash.quality === 'known' && existing.weapons.length !== stash.weapons.length) return true;
    const existingWeapons = new Map(existing.weapons.map((weapon) => [weapon.id, weapon]));
    for (const weapon of stash.weapons) {
      const existingWeapon = existingWeapons.get(weapon.id);
      if (!existingWeapon || !sameObservedValue(existingWeapon, weapon)) return true;
    }
  }
  return false;
}

function sameObservedValue(
  left: CharacterInstance | WeaponInstance | SummonInstance | ArtifactInstance | TreasureCount | ConsumableCount | TicketCount | ProgressionState,
  right: CharacterInstance | WeaponInstance | SummonInstance | ArtifactInstance | TreasureCount | ConsumableCount | TicketCount | ProgressionState,
): boolean {
  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).filter((key) => key !== 'updatedAt');
  const rightKeys = Object.keys(rightRecord).filter((key) => key !== 'updatedAt');
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!(key in rightRecord) || leftRecord[key] !== rightRecord[key]) return false;
  }
  return true;
}

function consumableKey(value: ConsumableCount): string {
  return `${value.group}:${value.itemKindId ?? ''}:${value.itemId}`;
}

function ticketKey(value: TicketCount): string {
  return `${value.group}:${value.itemKindId ?? ''}:${value.itemId}`;
}

function hasObservedData(snapshot: AccountSnapshot): boolean {
  return Object.values(snapshot.quality).some((quality) => quality !== 'unknown') || snapshot.weaponStashes.length > 0;
}
