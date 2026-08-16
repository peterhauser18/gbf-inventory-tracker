import type { AccountFamily } from '../account/database.ts';

export type AccountEvidenceKey = AccountFamily | 'weaponStashes';

const ACCOUNT_FAMILIES = [
  'characters',
  'weapons',
  'summons',
  'artifacts',
  'treasures',
  'consumables',
  'tickets',
  'accountStatus',
  'progression',
] as const satisfies readonly AccountFamily[];

const SECTION_EVIDENCE: Readonly<Record<string, readonly AccountEvidenceKey[] | 'all'>> = {
  overview: 'all',
  goals: ['characters', 'treasures', 'progression'],
  eternals: ['characters', 'treasures', 'progression'],
  evokers: ['characters', 'treasures', 'progression'],
  characters: ['characters'],
  weapons: ['weapons'],
  summons: ['summons'],
  treasures: ['treasures'],
  consumables: ['consumables', 'tickets'],
  stashes: ['weaponStashes'],
  settings: 'all',
  developer: 'all',
};

export function changedAccountEvidence(previous: unknown, next: unknown): AccountEvidenceKey[] {
  if (!isObject(next)) return [];
  const changed: AccountEvidenceKey[] = [];

  for (const family of ACCOUNT_FAMILIES) {
    if (familyRevision(previous, family) !== familyRevision(next, family)) changed.push(family);
  }

  if (stashRevision(previous) !== stashRevision(next)) changed.push('weaponStashes');
  return changed;
}

export function sectionUsesAccountEvidence(
  section: string | undefined,
  changed: readonly AccountEvidenceKey[],
): boolean {
  if (changed.length === 0) return false;
  if (!section) return true;
  const evidence = SECTION_EVIDENCE[section];
  if (!evidence) return false;
  if (evidence === 'all') return true;
  return changed.some((key) => evidence.includes(key));
}

function familyRevision(value: unknown, family: AccountFamily): string {
  if (!isObject(value)) return '';
  const observedAt = isObject(value.observedAt) ? finiteNumber(value.observedAt[family]) : undefined;
  const snapshot = isObject(value.snapshot) ? value.snapshot : undefined;
  const quality = snapshot && isObject(snapshot.quality) && typeof snapshot.quality[family] === 'string'
    ? snapshot.quality[family]
    : '';
  if (observedAt === undefined && quality === 'unknown') return '';
  return `${observedAt ?? ''}:${quality}`;
}

function stashRevision(value: unknown): string {
  if (!isObject(value) || !isObject(value.snapshot) || !Array.isArray(value.snapshot.weaponStashes)) return '';
  const stashes: string[] = [];
  for (const rawStash of value.snapshot.weaponStashes) {
    if (!isObject(rawStash)) continue;
    const stashId = text(rawStash.stashId);
    if (!stashId) continue;
    const quality = text(rawStash.quality) ?? '';
    const weapons = Array.isArray(rawStash.weapons)
      ? rawStash.weapons.flatMap((rawWeapon) => {
          if (!isObject(rawWeapon)) return [];
          const id = text(rawWeapon.id);
          if (!id) return [];
          return [`${id}:${finiteNumber(rawWeapon.updatedAt) ?? ''}`];
        }).sort()
      : [];
    stashes.push(`${stashId}:${quality}:${weapons.join(',')}`);
  }
  return stashes.sort().join('|');
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
