import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountSnapshot } from '../types/account.ts';
import { createAccountDatabase, mergeAccountDatabase } from './database.ts';
import { normalizePartyDeckAccountSnapshot } from './party-deck.ts';

function partyBody(weaponCount = 10) {
  const weapons: Record<string, unknown> = {};
  for (let slot = 1; slot <= weaponCount; slot += 1) {
    weapons[String(slot)] = {
      param: {
        id: `weapon-instance-${slot}`,
        level: slot === 1 ? '150' : '100',
        skill_level: '15',
        evolution: '4',
        arousal: slot === 2 ? { level: '5' } : undefined,
      },
      master: { id: slot <= 2 ? '1040000001' : String(1040000000 + slot), name: `Weapon ${slot}` },
    };
  }
  return {
    deck: {
      npc: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), {
        param: { id: `character-instance-${index + 1}`, level: String(80 + index), evolution: '5', arousal_level: '3' },
        master: { id: String(3040000001 + index), name: `Character ${index + 1}` },
      }])),
      pc: {
        weapons,
        summons: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), {
          param: { id: `summon-instance-${index + 1}`, level: '150', evolution: '4' },
          master: { id: index <= 1 ? '2040000001' : String(2040000001 + index), name: `Summon ${index + 1}` },
        }])),
      },
      supporter: {
        param: { id: 'support-instance' },
        master: { id: '2040999999', name: 'Support summon' },
      },
    },
  };
}

function emptySnapshot(at: number): AccountSnapshot {
  return {
    characters: [], weapons: [], summons: [], artifacts: [], weaponStashes: [], treasures: [], consumables: [], tickets: [], progression: [],
    quality: {
      characters: 'unknown', weapons: 'unknown', summons: 'unknown', artifacts: 'unknown', treasures: 'unknown', consumables: 'unknown', tickets: 'unknown', accountStatus: 'unknown', progression: 'unknown',
    },
    capturedAt: at,
  };
}

test('party deck normalizes owned character, 10/13-slot weapon and summon instances with partial collection quality', () => {
  const normal = normalizePartyDeckAccountSnapshot(partyBody(10), 1900);
  const snapshot = normalizePartyDeckAccountSnapshot(partyBody(13), 2000);
  assert.ok(normal);
  assert.ok(snapshot);
  assert.equal(normal.weapons.length, 10);
  assert.equal(snapshot.quality.characters, 'partial');
  assert.equal(snapshot.quality.weapons, 'partial');
  assert.equal(snapshot.quality.summons, 'partial');
  assert.equal(snapshot.characters.length, 5);
  assert.equal(snapshot.weapons.length, 13);
  assert.equal(snapshot.summons.length, 5);
  assert.equal(snapshot.characters[0]?.id, 'character-instance-1');
  assert.equal(snapshot.characters[0]?.masterId, '3040000001');
  assert.equal(snapshot.weapons[0]?.id, 'weapon-instance-1');
  assert.equal(snapshot.weapons[0]?.masterId, '1040000001');
  assert.equal(snapshot.weapons[1]?.awakeningLevel, 5);
  assert.equal(snapshot.summons[0]?.id, 'summon-instance-1');
  assert.equal(snapshot.summons.some((summon) => summon.id === 'support-instance'), false);
});

test('same master with different instance ids remains distinct for weapons and summons', () => {
  const snapshot = normalizePartyDeckAccountSnapshot(partyBody(), 2000)!;
  assert.equal(snapshot.weapons[0]?.masterId, snapshot.weapons[1]?.masterId);
  assert.notEqual(snapshot.weapons[0]?.id, snapshot.weapons[1]?.id);
  assert.equal(snapshot.summons[0]?.masterId, snapshot.summons[1]?.masterId);
  assert.notEqual(snapshot.summons[0]?.id, snapshot.summons[1]?.id);
});

test('party enrichment adds unseen instances without downgrading complete collection quality or erasing richer fields', () => {
  const currentSnapshot = emptySnapshot(1000);
  currentSnapshot.quality.weapons = 'known';
  currentSnapshot.weapons = [
    {
      id: 'weapon-instance-1',
      masterId: '1040000001',
      name: 'Rich existing weapon',
      level: 200,
      skillLevel: 20,
      uncap: 6,
      awakeningLevel: 9,
      updatedAt: 1000,
    },
  ];
  const current = createAccountDatabase(currentSnapshot);

  const party = normalizePartyDeckAccountSnapshot(partyBody(), 2000)!;
  const incoming = party.weapons.find((weapon) => weapon.id === 'weapon-instance-1')!;
  incoming.name = undefined;
  incoming.skillLevel = undefined;
  incoming.uncap = undefined;
  incoming.awakeningLevel = undefined;

  const merged = mergeAccountDatabase(current, party);
  const weapon = merged.snapshot.weapons.find((value) => value.id === 'weapon-instance-1');
  assert.equal(merged.snapshot.quality.weapons, 'known');
  assert.equal(merged.observedAt.weapons, 2000);
  assert.equal(weapon?.name, 'Rich existing weapon');
  assert.equal(weapon?.skillLevel, 20);
  assert.equal(weapon?.uncap, 6);
  assert.equal(weapon?.awakeningLevel, 9);
  assert.equal(weapon?.level, 150);
  assert.ok(merged.snapshot.weapons.some((value) => value.id === 'weapon-instance-2'));
});

test('party-only data creates partial collections before any complete inventory scan', () => {
  const party = normalizePartyDeckAccountSnapshot(partyBody(), 2000)!;
  const merged = mergeAccountDatabase(createAccountDatabase(emptySnapshot(1000)), party);
  assert.equal(merged.snapshot.quality.characters, 'partial');
  assert.equal(merged.snapshot.quality.weapons, 'partial');
  assert.equal(merged.snapshot.quality.summons, 'partial');
});
