import { CAPTURE_CATEGORIES, isSensitiveJsonKey } from './policy.ts';
import type {
  CaptureCategory,
  CaptureResourceType,
  CaptureScanSummary,
  CapturedResponseRecord,
} from './types.ts';

export const CAPTURE_EXPORT_SCHEMA = 'gbf-inventory-tracker.capture-export';
export const CAPTURE_EXPORT_VERSION = 1 as const;

const ACCOUNT_IDENTIFIER = '[account-identifier]';
const ACCOUNT_IDENTIFIER_PATH = 'account-identifier';
const ACCOUNT_CONTEXT_KEY = /^(account|player|profile|user|viewer)(?:s|_data|_info)?$/;
const ACCOUNT_CONTEXT_IDENTIFIER_KEYS = new Set(['avatar', 'avatar_url', 'display_name', 'id', 'image', 'image_url', 'name', 'nickname', 'uid', 'uuid']);
const ACCOUNT_IDENTIFIER_KEYS = new Set([
  'account_id',
  'account_ids',
  'account_name',
  'account_uuid',
  'account_names',
  'display_name',
  'nickname',
  'player_id',
  'player_ids',
  'player_name',
  'player_uuid',
  'player_names',
  'profile_id',
  'profile_ids',
  'profile_name',
  'profile_uuid',
  'profile_names',
  'user_id',
  'user_ids',
  'user_name',
  'user_uuid',
  'user_names',
  'viewer_id',
  'viewer_ids',
  'viewer_name',
  'viewer_uuid',
  'viewer_names',
]);

export interface CaptureExportBundleV1 {
  schema: typeof CAPTURE_EXPORT_SCHEMA;
  version: typeof CAPTURE_EXPORT_VERSION;
  exportedAt: number;
  scan: {
    startedAt: number;
    stoppedAt: number;
    responseCount: number;
    categories: Record<CaptureCategory, boolean>;
  };
  responses: ExportedResponseRecord[];
}

export interface ExportedResponseRecord {
  meta: {
    requestId: string;
    url: string;
    status?: number;
    mimeType?: string;
    resourceType: CaptureResourceType;
    capturedAt: number;
  };
  body: unknown;
  categories: CaptureCategory[];
}

export function selectRecordsForScan(
  records: CapturedResponseRecord[],
  scanId: string,
): CapturedResponseRecord[] {
  return records.filter((record) => record.scanId === scanId);
}

export function buildSanitizedExportBundle(
  scan: CaptureScanSummary,
  records: CapturedResponseRecord[],
  exportedAt = Date.now(),
): CaptureExportBundleV1 {
  if (scan.stoppedAt === undefined) {
    throw new Error('Stop observation before exporting the scan.');
  }

  const selected = selectRecordsForScan(records, scan.id);
  if (selected.length !== scan.responseCount) {
    throw new Error('Capture store is incomplete; refusing to export a partial scan.');
  }

  const responses = selected
    .map((record) => sanitizeExportRecord(record))
    .sort((a, b) => a.meta.capturedAt - b.meta.capturedAt || a.meta.requestId.localeCompare(b.meta.requestId));

  return {
    schema: CAPTURE_EXPORT_SCHEMA,
    version: CAPTURE_EXPORT_VERSION,
    exportedAt,
    scan: {
      startedAt: scan.startedAt,
      stoppedAt: scan.stoppedAt,
      responseCount: scan.responseCount,
      categories: sanitizeCategories(scan.categories),
    },
    responses,
  };
}

export function serializeCaptureExport(bundle: CaptureExportBundleV1): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function captureExportFilename(exportedAt: number): string {
  const day = new Date(exportedAt).toISOString().slice(0, 10);
  return `gbf-scan-sanitized-${day}.json`;
}

function sanitizeExportRecord(record: CapturedResponseRecord): ExportedResponseRecord {
  const url = sanitizeExportUrl(String(record.meta.url));
  return {
    meta: {
      requestId: String(record.meta.requestId),
      url,
      status: typeof record.meta.status === 'number' ? record.meta.status : undefined,
      mimeType: typeof record.meta.mimeType === 'string' ? record.meta.mimeType : undefined,
      resourceType: sanitizeResourceType(record.meta.resourceType),
      capturedAt: Number(record.meta.capturedAt),
    },
    body: sanitizeExportJson(record.body, hasAccountContextInUrl(url)),
    categories: CAPTURE_CATEGORIES.filter((category) => record.categories.includes(category)),
  };
}

function sanitizeExportJson(value: unknown, accountContext = false): unknown {
  if (typeof value === 'string') return sanitizeUrlString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeExportJson(item, accountContext));
  if (!value || typeof value !== 'object') return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveJsonKey(key)) continue;

    const normalized = normalizeKey(key);
    if (isAccountIdentifierKey(key) || (accountContext && ACCOUNT_CONTEXT_IDENTIFIER_KEYS.has(normalized))) {
      sanitized[key] = ACCOUNT_IDENTIFIER;
      continue;
    }

    sanitized[key] = sanitizeExportJson(
      nested,
      accountContext || ACCOUNT_CONTEXT_KEY.test(normalized),
    );
  }
  return sanitized;
}

function sanitizeUrlString(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return sanitizeExportUrl(value);
  } catch {
    // Not a URL; leave ordinary game strings untouched.
  }
  return value;
}

function sanitizeExportUrl(value: string): string {
  const url = new URL(value);
  const segments = url.pathname.split('/');
  const accountPath = segments.some((segment) => ACCOUNT_CONTEXT_KEY.test(normalizeKey(segment)));
  const sanitizedSegments = accountPath
    ? segments.map((segment) =>
        looksLikeAccountIdentifierSegment(segment) ? ACCOUNT_IDENTIFIER_PATH : segment,
      )
    : segments;
  return `${url.origin}${sanitizedSegments.join('/')}`;
}

function hasAccountContextInUrl(value: string): boolean {
  try {
    return new URL(value).pathname
      .split('/')
      .some((segment) => ACCOUNT_CONTEXT_KEY.test(normalizeKey(segment)));
  } catch {
    return false;
  }
}

function looksLikeAccountIdentifierSegment(value: string): boolean {
  return /^\d{5,}$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
}

function isAccountIdentifierKey(key: string): boolean {
  return ACCOUNT_IDENTIFIER_KEYS.has(normalizeKey(key));
}

function normalizeKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
}

function sanitizeCategories(
  categories: Record<CaptureCategory, boolean>,
): Record<CaptureCategory, boolean> {
  return Object.fromEntries(
    CAPTURE_CATEGORIES.map((category) => [category, categories[category] === true]),
  ) as Record<CaptureCategory, boolean>;
}

function sanitizeResourceType(value: CaptureResourceType): CaptureResourceType {
  if (value === 'xhr' || value === 'fetch' || value === 'document') return value;
  return 'other';
}
