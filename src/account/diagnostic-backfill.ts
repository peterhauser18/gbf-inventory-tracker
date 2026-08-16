import { normalizeCaptureScan } from '../capture/normalize.ts';
import {
  getCapturedResponsesForScan,
  getLatestCompletedCaptureScan,
} from '../capture/storage.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { mergeAccountDatabase, type AccountDatabaseState } from './database.ts';
import { isVerifiedAccountResponseUrl } from './ingest.ts';
import { loadAccountDatabase, saveAccountDatabase } from './storage.ts';

const CHARACTER_PATH = /^\/npc\/list\/\d+$/;

export function mergeCharactersFromCapturedRecords(
  current: AccountDatabaseState | null,
  records: CapturedResponseRecord[],
): AccountDatabaseState | null {
  const characterRecords = records.filter(isVerifiedCharacterRecord);
  if (characterRecords.length === 0) return current;

  const snapshot = normalizeCaptureScan(characterRecords);
  if (snapshot.quality.characters === 'unknown') return current;
  return mergeAccountDatabase(current, snapshot);
}

export async function backfillCharactersFromLatestCompletedDiagnosticScan(): Promise<void> {
  const scan = await getLatestCompletedCaptureScan();
  if (!scan) return;

  const records = await getCapturedResponsesForScan(scan.id);
  const current = await loadAccountDatabase();
  const next = mergeCharactersFromCapturedRecords(current, records);
  if (!next || next === current) return;

  await saveAccountDatabase(next);
}

function isVerifiedCharacterRecord(record: CapturedResponseRecord): boolean {
  if (!isVerifiedAccountResponseUrl(record.meta.url)) return false;
  try {
    return CHARACTER_PATH.test(new URL(record.meta.url).pathname);
  } catch {
    return false;
  }
}
