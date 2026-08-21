import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountDatabase } from '../account/database.ts';
import type { AccountSnapshot } from '../types/account.ts';
import { buildDashboardViewModel } from './model.ts';

function snapshot(): AccountSnapshot {
  return {
    characters: [],
    weapons: [],
    summons: [],
    artifacts: [],
    weaponStashes: [{
      stashId: '7',
      name: 'Fire Grid Archive',
      quality: 'known',
      weapons: [{ id: 'stash-weapon-1', masterId: '1040000001', name: 'Stored Blade', level: 150, updatedAt: 100 }],
    }],
    treasures: [],
    consumables: [],
    tickets: [],
    progression: [],
    quality: {
      characters: 'unknown',
      weapons: 'unknown',
      summons: 'unknown',
      artifacts: 'unknown',
      treasures: 'unknown',
      consumables: 'unknown',
      tickets: 'unknown',
      accountStatus: 'unknown',
      progression: 'unknown',
    },
    capturedAt: 100,
  };
}

test('named stash renders its observed name and its weapons also appear in normal Weapons cards', () => {
  const database = createAccountDatabase(snapshot());
  const model = buildDashboardViewModel(database.snapshot);

  assert.equal(model.stashes[0]?.title, 'Fire Grid Archive');
  assert.equal(model.stashes[0]?.children?.[0]?.title, 'Stored Blade');
  assert.equal(model.stashes[0]?.children?.[0]?.detailFields[0]?.value, 'Fire Grid Archive');
  assert.equal(model.weapons.length, 1);
  assert.equal(model.weapons[0]?.key, 'weapon:stash-weapon-1');
  assert.equal(model.stats.find((row) => row.label === 'Weapons')?.count, 1);
  assert.equal(model.quality.weapons, 'unknown');
});

test('unnamed stash falls back to an id-specific label instead of identical generic cards', () => {
  const value = snapshot();
  value.weaponStashes[0]!.name = undefined;
  const model = buildDashboardViewModel(createAccountDatabase(value).snapshot);
  assert.equal(model.stashes[0]?.title, 'Weapon Stash 7');
});
