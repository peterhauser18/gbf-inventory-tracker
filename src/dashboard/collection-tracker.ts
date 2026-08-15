import type { CharacterInstance } from '../types/account.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const TRACKER_URL = 'https://gbf.wiki/Collection_Tracker';
const PAGE_SIZE = 500;

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

type TrackerRarity = 2 | 3 | 4;
type JsonObject = Record<string, unknown>;

export type CollectionTrackerOmissionReason =
  | 'unsupported-master-id'
  | 'unknown-uncap'
  | 'unsupported-uncap'
  | 'not-in-wiki-dataset';

export interface CollectionTrackerOmission {
  masterId: string;
  reason: CollectionTrackerOmissionReason;
}

export interface CollectionTrackerExport {
  url: string;
  hash: string;
  includedMasterIds: string[];
  omitted: CollectionTrackerOmission[];
}

export interface DecodedTrackerCharacter {
  rarity: TrackerRarity;
  index: number;
  uncap: number;
}

export async function loadWikiCharacterMasterIds(
  fetcher: FetchLike = fetch,
): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetcher(characterCargoUrl(offset), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`GBF Wiki character dataset request failed (${response.status})`);
    const rows = cargoRows(await response.json());
    for (const row of rows) {
      const id = text(row.id);
      if (id) ids.add(id);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return ids;
}

export function buildCollectionTrackerExport(
  characters: readonly Pick<CharacterInstance, 'masterId' | 'uncap'>[],
  knownWikiMasterIds?: ReadonlySet<string>,
): CollectionTrackerExport {
  const selected: Record<TrackerRarity, Map<number, number>> = {
    2: new Map(),
    3: new Map(),
    4: new Map(),
  };
  const includedMasterIds: string[] = [];
  const omitted: CollectionTrackerOmission[] = [];
  const seen = new Set<string>();

  for (const character of characters) {
    if (seen.has(character.masterId)) continue;
    seen.add(character.masterId);

    const coordinate = trackerCoordinate(character.masterId);
    if (!coordinate) {
      omitted.push({ masterId: character.masterId, reason: 'unsupported-master-id' });
      continue;
    }
    if (knownWikiMasterIds && !knownWikiMasterIds.has(character.masterId)) {
      omitted.push({ masterId: character.masterId, reason: 'not-in-wiki-dataset' });
      continue;
    }
    if (character.uncap === undefined) {
      omitted.push({ masterId: character.masterId, reason: 'unknown-uncap' });
      continue;
    }
    if (!Number.isInteger(character.uncap) || character.uncap < 0 || character.uncap > 6) {
      omitted.push({ masterId: character.masterId, reason: 'unsupported-uncap' });
      continue;
    }

    selected[coordinate.rarity].set(coordinate.index, character.uncap + 1);
    includedMasterIds.push(character.masterId);
  }

  const hash = [
    '',
    encodeRarity(selected[4]),
    encodeRarity(selected[3]),
    encodeRarity(selected[2]),
    '',
    '',
    '',
  ].join('.');

  return {
    url: `${TRACKER_URL}#${hash}`,
    hash,
    includedMasterIds,
    omitted,
  };
}

export function decodeCollectionTrackerCharacters(hash: string): DecodedTrackerCharacter[] {
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  const separator = clean.includes(';') ? ';' : '.';
  const parts = clean.split(separator);
  const result: DecodedTrackerCharacter[] = [];
  const strings: Record<TrackerRarity, string> = {
    4: parts[1] ?? '',
    3: parts[2] ?? '',
    2: parts[3] ?? '',
  };

  for (const rarity of [4, 3, 2] as const) {
    const encoded = strings[rarity];
    if (!encoded) continue;
    const buffer = base64ToBytes(encoded);
    for (let group = 0; group < Math.floor(buffer.length / 3); group += 1) {
      const evos =
        buffer[group * 3] |
        (buffer[group * 3 + 1] << 8) |
        (buffer[group * 3 + 2] << 16);
      for (let slot = 0; slot < 8; slot += 1) {
        const evo = (evos >> (slot * 3)) & 0x07;
        if (evo <= 0) continue;
        result.push({ rarity, index: group * 8 + slot, uncap: evo - 1 });
      }
    }
  }

  return result;
}

function trackerCoordinate(masterId: string): { rarity: TrackerRarity; index: number } | null {
  const match = /^30([234])(\d{4})000$/.exec(masterId);
  if (!match) return null;
  const rarity = Number(match[1]) as TrackerRarity;
  const index = Number(match[2]);
  if (!Number.isInteger(index) || index < 0 || index > 999) return null;
  return { rarity, index };
}

function encodeRarity(values: ReadonlyMap<number, number>): string {
  if (values.size === 0) return '';
  const highId = Math.max(...values.keys());
  const groups = Math.floor(highId / 8) + 1;
  const buffer = new Uint8Array(groups * 3);

  for (let group = 0; group < groups; group += 1) {
    let evos = 0;
    for (let slot = 0; slot < 8; slot += 1) {
      evos |= (values.get(group * 8 + slot) ?? 0) << (slot * 3);
    }
    buffer[group * 3] = evos & 0xff;
    buffer[group * 3 + 1] = (evos >> 8) & 0xff;
    buffer[group * 3 + 2] = (evos >> 16) & 0xff;
  }

  return bytesToBase64(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace('=', '')
    .replace('+', '-')
    .replace('/', '_');
}

function base64ToBytes(value: string): Uint8Array {
  let normalized = value.replace('_', '/').replace('-', '+');
  if (normalized.length % 4) normalized += '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function characterCargoUrl(offset: number): URL {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'cargoquery');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('tables', 'characters');
  url.searchParams.set('fields', 'id');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  return url;
}

function cargoRows(body: unknown): JsonObject[] {
  if (!isObject(body) || !Array.isArray(body.cargoquery)) return [];
  const rows: JsonObject[] = [];
  for (const value of body.cargoquery) {
    if (!isObject(value)) continue;
    rows.push(isObject(value.title) ? value.title : value);
  }
  return rows;
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
