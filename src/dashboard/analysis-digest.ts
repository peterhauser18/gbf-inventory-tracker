import type { AccountSnapshot, DataQuality, SnapshotQuality } from '../types/account.ts';

export const ANALYSIS_DIGEST_FORMAT = 'gbfit-analysis-digest' as const;
export const ANALYSIS_DIGEST_VERSION = 1 as const;

export const ANALYSIS_DIGEST_FAMILIES = [
  'characters',
  'weapons',
  'summons',
  'artifacts',
  'treasures',
  'consumables',
  'tickets',
  'progression',
] as const;

export type AnalysisDigestFamily = typeof ANALYSIS_DIGEST_FAMILIES[number];

export interface AnalysisDigestFamilySummary {
  quality: DataQuality;
  count?: number;
}

export interface AnalysisDigestRankSummary {
  quality: DataQuality;
  value?: number;
}

export interface AnalysisDigest {
  format: typeof ANALYSIS_DIGEST_FORMAT;
  version: typeof ANALYSIS_DIGEST_VERSION;
  exportedAt: number;
  capturedAt: number;
  families: Record<AnalysisDigestFamily, AnalysisDigestFamilySummary>;
  rank: AnalysisDigestRankSummary;
}

export interface AnalysisDigestComparisonRow {
  key: AnalysisDigestFamily | 'rank';
  label: string;
  previous?: number;
  current?: number;
  delta?: number;
  quality: DataQuality;
}

export interface AnalysisDigestComparison {
  previousCapturedAt: number;
  currentCapturedAt: number;
  rows: AnalysisDigestComparisonRow[];
}

type JsonObject = Record<string, unknown>;

const FAMILY_LABELS: Record<AnalysisDigestFamily, string> = {
  characters: 'Characters',
  weapons: 'Weapons',
  summons: 'Summons',
  artifacts: 'Artifacts',
  treasures: 'Treasures',
  consumables: 'Consumables',
  tickets: 'Tickets',
  progression: 'Progression evidence',
};

export function buildAnalysisDigest(snapshot: AccountSnapshot, exportedAt: number): AnalysisDigest {
  return {
    format: ANALYSIS_DIGEST_FORMAT,
    version: ANALYSIS_DIGEST_VERSION,
    exportedAt: safeTimestamp(exportedAt),
    capturedAt: safeTimestamp(snapshot.capturedAt),
    families: {
      characters: familySummary(snapshot.characters.length, snapshot.quality.characters),
      weapons: familySummary(snapshot.weapons.length, snapshot.quality.weapons),
      summons: familySummary(snapshot.summons.length, snapshot.quality.summons),
      artifacts: familySummary(snapshot.artifacts.length, snapshot.quality.artifacts),
      treasures: familySummary(snapshot.treasures.length, snapshot.quality.treasures),
      consumables: familySummary(snapshot.consumables.length, snapshot.quality.consumables),
      tickets: familySummary(snapshot.tickets.length, snapshot.quality.tickets),
      progression: familySummary(snapshot.progression.length, snapshot.quality.progression),
    },
    rank: rankSummary(snapshot),
  };
}

export function serializeAnalysisDigest(digest: AnalysisDigest): string {
  return `${JSON.stringify(digest, null, 2)}\n`;
}

export function analysisDigestFilename(exportedAt: number): string {
  const date = new Date(safeTimestamp(exportedAt));
  const stamp = Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().replace(/[:.]/g, '-');
  return `gbfit-analysis-${stamp}.json`;
}

export function parseAnalysisDigest(json: string): AnalysisDigest {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Analysis snapshot is not valid JSON.');
  }
  if (!isObject(value)) throw new Error('Analysis snapshot must be a JSON object.');
  rejectUnknownKeys(value, ['format', 'version', 'exportedAt', 'capturedAt', 'families', 'rank'], 'snapshot');
  if (value.format !== ANALYSIS_DIGEST_FORMAT) throw new Error('Unsupported analysis snapshot format.');
  if (value.version !== ANALYSIS_DIGEST_VERSION) throw new Error('Unsupported analysis snapshot version.');

  const families = value.families;
  if (!isObject(families)) throw new Error('Analysis snapshot families are missing.');
  rejectUnknownKeys(families, ANALYSIS_DIGEST_FAMILIES, 'families');

  const parsedFamilies = {} as Record<AnalysisDigestFamily, AnalysisDigestFamilySummary>;
  for (const family of ANALYSIS_DIGEST_FAMILIES) {
    const summary = families[family];
    if (!isObject(summary)) throw new Error(`Analysis snapshot family ${family} is missing.`);
    rejectUnknownKeys(summary, ['quality', 'count'], family);
    const familyQuality = quality(summary.quality, `${family}.quality`);
    const familyCount = summary.count === undefined ? undefined : nonNegativeInteger(summary.count, `${family}.count`);
    if (familyQuality === 'known' && familyCount === undefined) throw new Error(`Known family ${family} requires a count.`);
    if (familyQuality === 'unknown' && familyCount !== undefined) throw new Error(`Unknown family ${family} must not carry a count.`);
    parsedFamilies[family] = { quality: familyQuality, count: familyCount };
  }

  const rank = value.rank;
  if (!isObject(rank)) throw new Error('Analysis snapshot rank summary is missing.');
  rejectUnknownKeys(rank, ['quality', 'value'], 'rank');
  const rankQuality = quality(rank.quality, 'rank.quality');
  const rankValue = rank.value === undefined ? undefined : nonNegativeInteger(rank.value, 'rank.value');
  if (rankQuality === 'known' && rankValue === undefined) throw new Error('Known rank snapshots require a rank value.');

  return {
    format: ANALYSIS_DIGEST_FORMAT,
    version: ANALYSIS_DIGEST_VERSION,
    exportedAt: timestamp(value.exportedAt, 'exportedAt'),
    capturedAt: timestamp(value.capturedAt, 'capturedAt'),
    families: parsedFamilies,
    rank: { quality: rankQuality, value: rankQuality === 'known' ? rankValue : undefined },
  };
}

export function compareAnalysisDigests(previous: AnalysisDigest, current: AnalysisDigest): AnalysisDigestComparison {
  const rows: AnalysisDigestComparisonRow[] = ANALYSIS_DIGEST_FAMILIES.map((family) => comparisonRow(
    family,
    FAMILY_LABELS[family],
    previous.families[family].count,
    previous.families[family].quality,
    current.families[family].count,
    current.families[family].quality,
  ));
  rows.push(comparisonRow('rank', 'Rank', previous.rank.value, previous.rank.quality, current.rank.value, current.rank.quality));
  return {
    previousCapturedAt: previous.capturedAt,
    currentCapturedAt: current.capturedAt,
    rows,
  };
}

function comparisonRow(
  key: AnalysisDigestComparisonRow['key'],
  label: string,
  previous: number | undefined,
  previousQuality: DataQuality,
  current: number | undefined,
  currentQuality: DataQuality,
): AnalysisDigestComparisonRow {
  const rowQuality = combineQuality(previousQuality, currentQuality);
  const comparable = previousQuality === 'known' && currentQuality === 'known' && previous !== undefined && current !== undefined;
  return {
    key,
    label,
    previous: comparable ? previous : undefined,
    current: comparable ? current : undefined,
    delta: comparable ? current - previous : undefined,
    quality: rowQuality,
  };
}

function familySummary(count: number, qualityValue: SnapshotQuality[AnalysisDigestFamily]): AnalysisDigestFamilySummary {
  return {
    quality: qualityValue,
    count: qualityValue === 'unknown' ? undefined : nonNegativeInteger(count, 'count'),
  };
}

function rankSummary(snapshot: AccountSnapshot): AnalysisDigestRankSummary {
  const value = safeOptionalInteger(snapshot.accountStatus?.rank);
  if (snapshot.quality.accountStatus === 'unknown') return { quality: 'unknown' };
  if (snapshot.quality.accountStatus === 'known' && value !== undefined) return { quality: 'known', value };
  return { quality: 'partial' };
}

function combineQuality(left: DataQuality, right: DataQuality): DataQuality {
  if (left === 'known' && right === 'known') return 'known';
  if (left === 'unknown' && right === 'unknown') return 'unknown';
  return 'partial';
}

function quality(value: unknown, path: string): DataQuality {
  if (value === 'known' || value === 'partial' || value === 'unknown') return value;
  throw new Error(`Invalid data quality at ${path}.`);
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid non-negative integer at ${path}.`);
  }
  return value;
}

function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid timestamp at ${path}.`);
  return value;
}

function safeTimestamp(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeOptionalInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function rejectUnknownKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) throw new Error(`Unexpected field in ${path}: ${unknown[0]}`);
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
