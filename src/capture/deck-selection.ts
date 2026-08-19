export interface ObservedDeckSelection {
  deckId: string;
  raidId?: string;
  source: 'host' | 'join';
}

type Obj = Record<string, unknown>;

export function parseObservedDeckSelectionRequest(
  url: string,
  method: string | undefined,
  postData: string | undefined,
): ObservedDeckSelection | null {
  if (method !== 'POST' || !postData) return null;

  let path: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'game.granbluefantasy.jp') return null;
    path = parsed.pathname;
  } catch {
    return null;
  }

  if (path !== '/quest/create_quest' && path !== '/quest/raid_deck_data_create') return null;

  let body: unknown;
  try {
    body = JSON.parse(postData);
  } catch {
    return null;
  }
  if (!obj(body)) return null;

  if (path === '/quest/create_quest') {
    const deckId = numericId(body.deck_id, 40);
    return deckId ? { deckId, source: 'host' } : null;
  }

  const deckId = numericId(body.user_deck_priority, 40);
  const raidId = numericId(body.raid_id, 120);
  if (!deckId || !raidId) return null;
  return { deckId, raidId, source: 'join' };
}

function numericId(value: unknown, maxLength: number): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value).slice(0, maxLength) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return /^\d+$/.test(normalized) && normalized !== '0' && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
