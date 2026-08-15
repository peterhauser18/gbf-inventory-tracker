import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardViewModel } from './model.ts';
import type { AccountSnapshot } from '../types/account.ts';

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    characters: [],
    weapons: [],
    summons: [],
    artifacts: [],
    weaponStashes: [],
    treasures: [],
    consumables: [],
    tickets: [],
    progression: [],
    quality: {
      characters: 'partial',
      weapons: 'partial',
      summons: 'known',
      artifacts: 'unknown',
      treasures: 'known',
      consumables: 'partial',
      tickets: 'known',
      accountStatus: 'known',
      progression: 'unknown',
    },
    capturedAt: 100,
    ...overrides,
  };
}

test('builds all dashboard families and keeps missing special characters unknown under partial roster coverage', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-character-instance', masterId: '3040030000', level: 80, uncap: 4, awakeningLevel: 7, updatedAt: 1 },
    ],
    treasures: [
      { itemId: '102', name: 'Indicus Centrum', quantity: 35, updatedAt: 1 },
      { itemId: '112', name: 'Water Urn', quantity: 5, updatedAt: 1 },
    ],
    weapons: [{ id: 'fixture-weapon-instance', masterId: '1040000000', level: 150, updatedAt: 1 }],
    summons: [{ id: 'fixture-summon-instance', masterId: '2040000000', level: 100, updatedAt: 1 }],
    weaponStashes: [{ stashId: 'fixture-stash', weapons: [], quality: 'known' }],
  }));

  assert.equal(model.eternals.length, 10);
  assert.equal(model.evokers.length, 10);
  const anre = model.eternals.find((card) => card.title === 'Anre');
  const tweyen = model.eternals.find((card) => card.title === 'Tweyen');
  assert.equal(anre?.targetReached, false);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Indicus Centrum')?.missing, 0);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Water Urn')?.missing, 5);
  assert.equal(tweyen?.prerequisiteEvidence[0]?.state, 'unknown');
  assert.equal(model.weapons[0]?.wikiUrl.includes('fixture-weapon-instance'), false);
  assert.equal(model.stashes[0]?.quality, 'known');
});

test('marks an observed 5-star target reached and does not pretend higher stages are modeled', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-caim', masterId: '3040164000', level: 100, uncap: 5, updatedAt: 1 },
    ],
  }));
  const caim = model.evokers.find((card) => card.title === 'Caim');
  assert.equal(caim?.targetReached, true);
  assert.match(caim?.notes[0] ?? '', /Higher-stage requirements are not modeled/);
});
