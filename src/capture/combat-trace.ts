import type { CombatCaptureTraceEntry, CombatCaptureTraceStage } from './types.ts';

const STORAGE_KEY = 'gbfit:combat-capture-trace-v1';
const TRACE_LIMIT = 40;
const TRACKED_PATHS = new Set<string>([
  '/rest/raid/start.json',
  '/rest/raid/normal_attack_result.json',
  '/rest/raid/ability_result.json',
  '/rest/raid/summon_result.json',
  '/rest/raid/temporary_item_result.json',
  '/rest/multiraid/start.json',
  '/rest/multiraid/normal_attack_result.json',
  '/rest/multiraid/ability_result.json',
  '/rest/multiraid/summon_result.json',
  '/rest/multiraid/temporary_item_result.json',
  '/rest/multiraid/fatal_chain_result.json',
  '/rest/multiraid/multi_member_info',
]);
const TRACKED_STAGES = new Set<CombatCaptureTraceStage>([
  'response-seen',
  'route-rejected',
  'allowlisted',
  'state-rejected',
  'queued',
  'body-read',
  'record-built',
  'ingest-start',
  'ingest-null',
  'ingest-success',
  'completed',
  'error',
]);
let writeQueue: Promise<void> = Promise.resolve();

export function combatCaptureTracePath(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return undefined;
    return TRACKED_PATHS.has(parsed.pathname) ? parsed.pathname : undefined;
  } catch {
    return undefined;
  }
}

export function appendCombatCaptureTrace(
  current: readonly CombatCaptureTraceEntry[] | undefined,
  entry: CombatCaptureTraceEntry,
): CombatCaptureTraceEntry[] {
  return [...(current ?? []), entry].slice(-TRACE_LIMIT);
}

export function sanitizeCombatCaptureTrace(value: unknown): CombatCaptureTraceEntry[] {
  if (!Array.isArray(value)) return [];
  const sanitized: CombatCaptureTraceEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.at !== 'number' || !Number.isFinite(raw.at) || raw.at < 0) continue;
    if (typeof raw.path !== 'string' || !TRACKED_PATHS.has(raw.path)) continue;
    if (typeof raw.stage !== 'string' || !TRACKED_STAGES.has(raw.stage as CombatCaptureTraceStage)) continue;
    sanitized.push({
      at: raw.at,
      path: raw.path,
      stage: raw.stage as CombatCaptureTraceStage,
    });
  }
  return sanitized.slice(-TRACE_LIMIT);
}

export async function recordCombatCaptureTrace(
  url: string,
  stage: CombatCaptureTraceStage,
  at = Date.now(),
): Promise<void> {
  const path = combatCaptureTracePath(url);
  if (!path) return;
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const stored = await chrome.storage.session.get(STORAGE_KEY);
      const current = sanitizeCombatCaptureTrace(stored[STORAGE_KEY]);
      const next = appendCombatCaptureTrace(current, { at, path, stage });
      await chrome.storage.session.set({ [STORAGE_KEY]: next });
    });
  await writeQueue;
}

export async function getCombatCaptureTrace(): Promise<CombatCaptureTraceEntry[]> {
  await writeQueue.catch(() => {});
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  return sanitizeCombatCaptureTrace(stored[STORAGE_KEY]);
}

export async function clearCombatCaptureTrace(): Promise<void> {
  await writeQueue.catch(() => {});
  await chrome.storage.session.remove(STORAGE_KEY);
}
