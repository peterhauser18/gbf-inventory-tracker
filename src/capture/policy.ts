import type {
  CaptureCategory,
  CaptureScanSummary,
  CapturedResponseRecord,
  ObservedResponse,
} from './types.ts';

export const CAPTURE_CATEGORIES: CaptureCategory[] = [
  'characters',
  'weapons',
  'summons',
  'treasures',
  'progression',
  'roster',
];

const SENSITIVE_KEY = /(?:^|[_-])(auth|authorization|cookie|cookies|credential|credentials|csrf|password|passwd|secret|session|sid|token)(?:$|[_-])/i;
const REDACTED = '[redacted]';
const COMPACT_TREASURE_PATH = '/item/article_list_by_filter_mode';

export function isGbfPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'game.granbluefantasy.jp';
  } catch {
    return false;
  }
}

export function isCaptureCandidate(meta: ObservedResponse): boolean {
  return (
    isGbfPageUrl(meta.url) &&
    (meta.resourceType === 'xhr' || meta.resourceType === 'fetch')
  );
}

export function sanitizeResponseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function redactSensitiveJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactSensitiveJson(item));
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    sanitized[key] = isSensitiveJsonKey(key) ? REDACTED : redactSensitiveJson(nested);
  }
  return sanitized;
}

export function isSensitiveJsonKey(key: string): boolean {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return SENSITIVE_KEY.test(normalized);
}

export function inferCaptureCategories(url: string, body: unknown): CaptureCategory[] {
  const hints = new Set<string>();
  for (const segment of new URL(url).pathname.toLowerCase().split(/[^a-z0-9]+/)) {
    if (segment) hints.add(segment);
  }
  collectObjectKeys(body, hints, 0);
  const haystack = [...hints].join(' ');

  const categories = new Set<CaptureCategory>();
  if (/\b(chara|character|characters|member|members)\b/.test(haystack)) categories.add('characters');
  if (/\b(weapon|weapons|arm|arms)\b/.test(haystack)) categories.add('weapons');
  if (/\b(summon|summons)\b/.test(haystack)) categories.add('summons');
  if (/\b(treasure|treasures|material|materials|inventory|item|items)\b/.test(haystack)) categories.add('treasures');
  if (/\b(eternal|eternals|juuten|evoker|evokers|arcarum|progress|progression|uncap|uncaps)\b/.test(haystack)) {
    categories.add('progression');
  }
  if (
    categories.has('characters') ||
    categories.has('weapons') ||
    categories.has('summons') ||
    /\b(roster|collection)\b/.test(haystack)
  ) {
    categories.add('roster');
  }

  return CAPTURE_CATEGORIES.filter((category) => categories.has(category));
}

function collectObjectKeys(value: unknown, hints: Set<string>, depth: number): void {
  if (depth > 6 || hints.size > 500) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectObjectKeys(item, hints, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    for (const segment of key.toLowerCase().split(/[^a-z0-9]+/)) {
      if (segment) hints.add(segment);
    }
    collectObjectKeys(nested, hints, depth + 1);
  }
}

export function buildCapturedResponse(
  meta: ObservedResponse,
  rawBody: string,
  scanId: string,
  capturedAt: number,
): CapturedResponseRecord | null {
  if (!isCaptureCandidate(meta)) return null;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const url = sanitizeResponseUrl(meta.url);
  const path = new URL(url).pathname;
  const body = path === COMPACT_TREASURE_PATH
    ? compactTreasureResponse(parsedBody)
    : redactSensitiveJson(parsedBody);
  const categories = path === COMPACT_TREASURE_PATH
    ? ['treasures'] satisfies CaptureCategory[]
    : inferCaptureCategories(url, body);

  return {
    id: `${scanId}:${meta.requestId}`,
    scanId,
    meta: {
      requestId: meta.requestId,
      url,
      status: meta.status,
      mimeType: meta.mimeType,
      resourceType: meta.resourceType,
      capturedAt,
    },
    body,
    categories,
  };
}

function compactTreasureResponse(value: unknown): unknown {
  if (!Array.isArray(value)) return { unexpectedTreasureResponse: true };
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const source = entry as Record<string, unknown>;
    return {
      item_id: compactTreasureId(source.item_id),
      name: typeof source.name === 'string' ? source.name : undefined,
      number: compactTreasureQuantity(source.number),
    };
  });
}

function compactTreasureId(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function compactTreasureQuantity(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) return value;
  return undefined;
}

export function emptyCaptureSummary(id: string, startedAt: number): CaptureScanSummary {
  return {
    id,
    startedAt,
    responseCount: 0,
    categories: {
      characters: false,
      weapons: false,
      summons: false,
      treasures: false,
      progression: false,
      roster: false,
    },
  };
}

export function addRecordToSummary(
  summary: CaptureScanSummary,
  record: CapturedResponseRecord,
  increment = true,
): CaptureScanSummary {
  const categories = { ...summary.categories };
  for (const category of record.categories) categories[category] = true;
  return {
    ...summary,
    responseCount: summary.responseCount + (increment ? 1 : 0),
    categories,
  };
}
