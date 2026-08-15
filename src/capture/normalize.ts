import type {
  AccountSnapshot,
  AccountStatus,
  ArtifactInstance,
  CharacterInstance,
  ConsumableCount,
  DataQuality,
  SnapshotQuality,
  SummonInstance,
  TicketCount,
  TreasureCount,
  WeaponInstance,
  WeaponStashSnapshot,
} from '../types/account.ts';
import type { CapturedResponseRecord } from './types.ts';

type JsonObject = Record<string, unknown>;
interface PageObservation<T> {
  current: number;
  last: number;
  capturedAt: number;
  items: T[];
  structurallyComplete: boolean;
  resultCount?: number;
  totalCount?: number;
  filtered?: boolean;
}

const PATHS = {
  characters: /^\/npc\/list\/(\d+)$/,
  weapons: /^\/weapon\/list\/(\d+)$/,
  summons: /^\/summon\/list\/(\d+)$/,
  artifacts: /^\/rest\/artifact\/list\/(\d+)$/,
  weaponStash: /^\/weapon\/container_list\/(\d+)\/([^/]+)$/,
};

export function normalizeCaptureScan(records: CapturedResponseRecord[]): AccountSnapshot {
  const ordered = [...records].sort(
    (a, b) => a.meta.capturedAt - b.meta.capturedAt || a.meta.requestId.localeCompare(b.meta.requestId),
  );
  const characterPages: PageObservation<CharacterInstance>[] = [];
  const weaponPages: PageObservation<WeaponInstance>[] = [];
  const summonPages: PageObservation<SummonInstance>[] = [];
  const artifactPages: PageObservation<ArtifactInstance>[] = [];
  const stashPages = new Map<string, PageObservation<WeaponInstance>[]>();
  const treasures = new Map<string, TreasureCount>();
  const consumables = new Map<string, ConsumableCount>();
  const tickets = new Map<string, TicketCount>();
  let treasureQuality: DataQuality = 'unknown';
  let consumableQuality: DataQuality = 'unknown';
  let ticketQuality: DataQuality = 'unknown';
  let accountStatusQuality: DataQuality = 'unknown';
  let accountStatus: AccountStatus | undefined;

  for (const record of ordered) {
    const path = safePath(record.meta.url);
    if (!path) continue;

    const characterPage = parsePagedRecord(record, PATHS.characters, parseCharacter, isPrimaryRosterFiltered);
    if (characterPage) {
      characterPages.push(characterPage);
      continue;
    }
    const weaponPage = parsePagedRecord(record, PATHS.weapons, parseWeapon, isPrimaryRosterFiltered);
    if (weaponPage) {
      weaponPages.push(weaponPage);
      continue;
    }
    const summonPage = parsePagedRecord(record, PATHS.summons, parseSummon, isPrimaryRosterFiltered);
    if (summonPage) {
      summonPages.push(summonPage);
      continue;
    }
    const artifactPage = parsePagedRecord(record, PATHS.artifacts, parseArtifact);
    if (artifactPage) {
      artifactPages.push(artifactPage);
      continue;
    }

    const stashMatch = PATHS.weaponStash.exec(path);
    if (stashMatch) {
      const stashPage = parsePagedRecord(record, PATHS.weaponStash, parseWeapon, isWeaponStashFiltered);
      const stashId = stashMatch[2];
      if (stashPage && stashId) {
        const pages = stashPages.get(stashId) ?? [];
        pages.push(stashPage);
        stashPages.set(stashId, pages);
        continue;
      }
    }

    if (path === '/item/article_list_by_filter_mode' && Array.isArray(record.body)) {
      let complete = true;
      for (const value of record.body) {
        const item = parseTreasure(value, record.meta.capturedAt);
        if (item) treasures.set(item.itemId, item);
        else complete = false;
      }
      treasureQuality = complete ? 'known' : 'partial';
      continue;
    }

    if (path === '/item/recovery_and_evolution_list_by_filter_mode' && isObject(record.body)) {
      let complete = true;
      for (const [group, value] of Object.entries(record.body)) {
        complete = collectConsumables(value, group, record.meta.capturedAt, consumables) && complete;
      }
      consumableQuality = complete ? 'known' : 'partial';
      continue;
    }

    if (path === '/item/gacha_ticket_and_others_list_by_filter_mode' && Array.isArray(record.body)) {
      let complete = true;
      for (const [groupIndex, groupValue] of record.body.entries()) {
        if (!Array.isArray(groupValue)) {
          complete = false;
          continue;
        }
        const group = groupIndex === 0 ? 'tickets' : groupIndex === 1 ? 'others' : `group-${groupIndex}`;
        for (const value of groupValue) {
          const item = parseTicket(value, group, record.meta.capturedAt);
          if (item) {
            const key = `${item.group}:${item.itemKindId ?? ''}:${item.itemId}`;
            tickets.set(key, item);
          } else {
            complete = false;
          }
        }
      }
      ticketQuality = complete ? 'known' : 'partial';
      continue;
    }

    if (path === '/user/status' && isObject(record.body)) {
      const status = isObject(record.body.status) ? record.body.status : undefined;
      if (status) {
        const rank = optionalNumber(status.level);
        accountStatus = { rank, updatedAt: record.meta.capturedAt };
        accountStatusQuality = rank === undefined ? 'partial' : 'known';
      }
    }
  }

  const characters = mergePages(characterPages);
  const weapons = mergePages(weaponPages);
  const summons = mergePages(summonPages);
  const artifacts = mergePages(artifactPages);
  const weaponStashes: WeaponStashSnapshot[] = [...stashPages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stashId, pages]) => ({ stashId, weapons: mergePages(pages), quality: pageQuality(pages) }));
  const quality: SnapshotQuality = {
    characters: pageQuality(characterPages),
    weapons: pageQuality(weaponPages),
    summons: pageQuality(summonPages),
    artifacts: pageQuality(artifactPages),
    treasures: treasureQuality,
    consumables: consumableQuality,
    tickets: ticketQuality,
    accountStatus: accountStatusQuality,
    progression: 'unknown',
  };

  return {
    characters,
    weapons,
    summons,
    artifacts,
    weaponStashes,
    treasures: [...treasures.values()],
    consumables: [...consumables.values()],
    tickets: [...tickets.values()],
    progression: [],
    accountStatus,
    quality,
    capturedAt: ordered.at(-1)?.meta.capturedAt ?? 0,
  };
}

export function findTreasureQuantity(
  snapshot: AccountSnapshot,
  itemId: string,
): { state: 'known'; quantity: number } | { state: 'unknown' } {
  const item = snapshot.treasures.find((candidate) => candidate.itemId === itemId);
  return item ? { state: 'known', quantity: item.quantity } : { state: 'unknown' };
}

function parsePagedRecord<T>(
  record: CapturedResponseRecord,
  pattern: RegExp,
  parseItem: (value: unknown, capturedAt: number) => T | null,
  filterCheck?: (body: JsonObject) => boolean | undefined,
): PageObservation<T> | null {
  const path = safePath(record.meta.url);
  if (!path || !pattern.test(path) || !isObject(record.body) || !Array.isArray(record.body.list)) return null;
  const current = requiredPositiveInt(record.body.current);
  const last = requiredPositiveInt(record.body.last);
  if (current === null || last === null) return null;
  const items: T[] = [];
  let structurallyComplete = true;
  for (const value of record.body.list) {
    const parsed = parseItem(value, record.meta.capturedAt);
    if (parsed) items.push(parsed);
    else structurallyComplete = false;
  }
  const options = isObject(record.body.options) ? record.body.options : undefined;
  return {
    current,
    last,
    capturedAt: record.meta.capturedAt,
    items,
    structurallyComplete,
    resultCount: optionalNonNegativeInt(record.body.count),
    totalCount: options ? optionalNonNegativeInt(options.number) : undefined,
    filtered: filterCheck?.(record.body),
  };
}

function mergePages<T extends { id: string; updatedAt: number }>(pages: PageObservation<T>[]): T[] {
  const merged = new Map<string, T>();
  for (const page of pages) {
    for (const item of page.items) {
      const existing = merged.get(item.id);
      if (!existing || item.updatedAt >= existing.updatedAt) merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

function pageQuality<T>(pages: PageObservation<T>[]): DataQuality {
  if (pages.length === 0) return 'unknown';
  const newestByPage = new Map<number, PageObservation<T>>();
  for (const page of pages) {
    const existing = newestByPage.get(page.current);
    if (!existing || page.capturedAt >= existing.capturedAt) newestByPage.set(page.current, page);
  }
  const advertisedLast = Math.max(...[...newestByPage.values()].map((page) => page.last));
  for (let page = 1; page <= advertisedLast; page += 1) {
    const observation = newestByPage.get(page);
    if (!observation || !observation.structurallyComplete || observation.filtered) return 'partial';
    if (
      observation.resultCount === undefined ||
      observation.totalCount === undefined ||
      observation.resultCount !== observation.totalCount
    ) return 'partial';
  }
  return 'known';
}

function parseCharacter(value: unknown, capturedAt: number): CharacterInstance | null {
  if (!isObject(value) || !isObject(value.param) || !isObject(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  return {
    id,
    masterId,
    level: optionalNumber(value.param.level),
    uncap: optionalNumber(value.param.evolution),
    awakeningLevel: optionalNumber(value.param.arousal_level),
    updatedAt: capturedAt,
  };
}

function parseWeapon(value: unknown, capturedAt: number): WeaponInstance | null {
  if (!isObject(value) || !isObject(value.param) || !isObject(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  const arousal = isObject(value.param.arousal) ? value.param.arousal : undefined;
  return {
    id,
    masterId,
    level: optionalNumber(value.param.level),
    skillLevel: optionalNumber(value.param.skill_level),
    uncap: optionalNumber(value.param.evolution),
    awakeningLevel: arousal ? optionalNumber(arousal.level) : undefined,
    updatedAt: capturedAt,
  };
}

function parseSummon(value: unknown, capturedAt: number): SummonInstance | null {
  if (!isObject(value) || !isObject(value.param) || !isObject(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  return {
    id,
    masterId,
    level: optionalNumber(value.param.level),
    uncap: optionalNumber(value.param.evolution),
    updatedAt: capturedAt,
  };
}

function parseArtifact(value: unknown, capturedAt: number): ArtifactInstance | null {
  if (!isObject(value)) return null;
  const id = technicalId(value.id);
  const masterId = technicalId(value.artifact_id);
  if (!id || !masterId) return null;
  return {
    id,
    masterId,
    name: optionalString(value.name),
    level: optionalNumber(value.level),
    kindId: technicalId(value.kind),
    attributeId: technicalId(value.attribute),
    updatedAt: capturedAt,
  };
}

function parseTreasure(value: unknown, capturedAt: number): TreasureCount | null {
  if (!isObject(value)) return null;
  const itemId = technicalId(value.item_id);
  const quantity = requiredNonNegativeNumber(value.number);
  if (!itemId || quantity === null) return null;
  return { itemId, name: optionalString(value.name), quantity, updatedAt: capturedAt };
}

function parseTicket(value: unknown, group: string, capturedAt: number): TicketCount | null {
  if (!isObject(value)) return null;
  const itemId = technicalId(value.item_id);
  const quantity = requiredNonNegativeNumber(value.number);
  if (!itemId || quantity === null) return null;
  return {
    itemId,
    itemKindId: technicalId(value.item_kind_id ?? value.item_kind),
    group,
    name: optionalString(value.name),
    quantity,
    updatedAt: capturedAt,
  };
}

function collectConsumables(
  value: unknown,
  group: string,
  capturedAt: number,
  sink: Map<string, ConsumableCount>,
): boolean {
  if (Array.isArray(value)) {
    let complete = true;
    for (const child of value) complete = collectConsumables(child, group, capturedAt, sink) && complete;
    return complete;
  }
  if (!isObject(value)) return true;

  const hasItemShape = 'item_id' in value || 'number' in value;
  const itemId = technicalId(value.item_id);
  const quantity = requiredNonNegativeNumber(value.number);
  if (itemId && quantity !== null) {
    const itemKindId = technicalId(value.item_kind_id ?? value.item_kind);
    const key = `${group}:${itemKindId ?? ''}:${itemId}`;
    sink.set(key, {
      itemId,
      itemKindId,
      group,
      name: optionalString(value.name),
      quantity,
      updatedAt: capturedAt,
    });
    return true;
  }
  if (hasItemShape) return false;

  let complete = true;
  for (const child of Object.values(value)) complete = collectConsumables(child, group, capturedAt, sink) && complete;
  return complete;
}

function isPrimaryRosterFiltered(body: JsonObject): boolean | undefined {
  return isSelectorFiltered(body, '11110');
}

function isWeaponStashFiltered(body: JsonObject): boolean | undefined {
  return isSelectorFiltered(body, '00110');
}

function isSelectorFiltered(body: JsonObject, defaultRarityMask: string): boolean | undefined {
  const options = isObject(body.options) ? body.options : undefined;
  const filter = options && isObject(options.filter) ? options.filter : undefined;
  if (!filter) return undefined;
  for (const [key, value] of Object.entries(filter)) {
    if (key === '5') {
      if (value !== defaultRarityMask) return true;
      continue;
    }
    if (!isEmptyFilterValue(value)) return true;
  }
  return false;
}

function isEmptyFilterValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.length > 0 && /^0+$/.test(value);
  return false;
}

function safePath(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function technicalId(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredNonNegativeNumber(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== undefined && parsed >= 0 ? parsed : null;
}

function optionalNonNegativeInt(value: unknown): number | undefined {
  const parsed = optionalNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function requiredPositiveInt(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
