import type {
  AccountSnapshot,
  CharacterInstance,
  SnapshotQuality,
  SummonInstance,
  WeaponInstance,
} from '../types/account.ts';

type Obj = Record<string, unknown>;

export function normalizePartyDeckAccountSnapshot(body: unknown, capturedAt: number): AccountSnapshot | null {
  if (!obj(body) || !obj(body.deck)) return null;
  const deck = body.deck;
  const pc = obj(deck.pc) ? deck.pc : undefined;
  if (!pc) return null;

  const characters = orderedObjectValues(deck.npc).flatMap((value) => {
    const parsed = parseCharacter(value, capturedAt);
    return parsed ? [parsed] : [];
  });
  const weapons = orderedObjectValues(pc.weapons).flatMap((value) => {
    const parsed = parseWeapon(value, capturedAt);
    return parsed ? [parsed] : [];
  });
  const summons = orderedObjectValues(pc.summons).flatMap((value) => {
    const parsed = parseSummon(value, capturedAt);
    return parsed ? [parsed] : [];
  });

  if (!characters.length && !weapons.length && !summons.length) return null;

  const quality: SnapshotQuality = {
    characters: characters.length ? 'partial' : 'unknown',
    weapons: weapons.length ? 'partial' : 'unknown',
    summons: summons.length ? 'partial' : 'unknown',
    artifacts: 'unknown',
    treasures: 'unknown',
    consumables: 'unknown',
    tickets: 'unknown',
    accountStatus: 'unknown',
    progression: 'unknown',
  };

  return {
    characters,
    weapons,
    summons,
    artifacts: [],
    weaponStashes: [],
    treasures: [],
    consumables: [],
    tickets: [],
    progression: [],
    quality,
    capturedAt,
  };
}

function parseCharacter(value: unknown, capturedAt: number): CharacterInstance | null {
  if (!obj(value) || !obj(value.param) || !obj(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  return {
    id,
    masterId,
    name: optionalString(value.master.name),
    level: optionalNumber(value.param.level),
    uncap: optionalNumber(value.param.evolution),
    awakeningLevel: optionalNumber(value.param.arousal_level),
    updatedAt: capturedAt,
  };
}

function parseWeapon(value: unknown, capturedAt: number): WeaponInstance | null {
  if (!obj(value) || !obj(value.param) || !obj(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  const arousal = obj(value.param.arousal) ? value.param.arousal : undefined;
  return {
    id,
    masterId,
    name: optionalString(value.master.name),
    level: optionalNumber(value.param.level),
    skillLevel: optionalNumber(value.param.skill_level),
    uncap: optionalNumber(value.param.evolution),
    awakeningLevel: arousal ? optionalNumber(arousal.level) : undefined,
    updatedAt: capturedAt,
  };
}

function parseSummon(value: unknown, capturedAt: number): SummonInstance | null {
  if (!obj(value) || !obj(value.param) || !obj(value.master)) return null;
  const id = technicalId(value.param.id);
  const masterId = technicalId(value.master.id);
  if (!id || !masterId) return null;
  return {
    id,
    masterId,
    name: optionalString(value.master.name),
    level: optionalNumber(value.param.level),
    uncap: optionalNumber(value.param.evolution),
    updatedAt: capturedAt,
  };
}

function orderedObjectValues(value: unknown): unknown[] {
  if (!obj(value)) return [];
  return Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, entry]) => entry);
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
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
