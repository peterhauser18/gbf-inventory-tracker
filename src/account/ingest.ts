import { normalizeCaptureScan } from '../capture/normalize.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import type { AccountSnapshot } from '../types/account.ts';
import { mergeAccountDatabase, type AccountDatabaseState } from './database.ts';

const TREASURE_PATH = '/item/article_list_by_filter_mode';

const VERIFIED_PATHS = [
  /^\/npc\/list\/\d+$/,
  /^\/weapon\/list\/\d+$/,
  /^\/summon\/list\/\d+$/,
  /^\/rest\/artifact\/list\/\d+$/,
  /^\/weapon\/container_list\/\d+\/[^/]+$/,
];

const VERIFIED_EXACT_PATHS = new Set([
  TREASURE_PATH,
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
  if (current && isTreasureResponse(record.meta.url) && sameKnownTreasures(current.snapshot, fragment)) return current;
  return mergeAccountDatabase(current, fragment);
}

function sameKnownTreasures(current: AccountSnapshot, incoming: AccountSnapshot): boolean {
  if (current.quality.treasures !== 'known' || incoming.quality.treasures !== 'known') return false;
  if (current.treasures.length !== incoming.treasures.length) return false;

  const currentById = new Map(current.treasures.map((item) => [item.itemId, item]));
  return incoming.treasures.every((item) => {
    const existing = currentById.get(item.itemId);
    return existing?.quantity === item.quantity && existing.name === item.name;
  });
}

function isTreasureResponse(url: string): boolean {
  try {
    return new URL(url).pathname === TREASURE_PATH;
  } catch {
    return false;
  }
}

function hasObservedData(snapshot: AccountSnapshot): boolean {
  return Object.values(snapshot.quality).some((quality) => quality !== 'unknown') || snapshot.weaponStashes.length > 0;
}
