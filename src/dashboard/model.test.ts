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
  assert.equal(anre?.targetDisplay, '5★');
  assert.equal(anre?.targetReached, false);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Indicus Centrum')?.missing, 0);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Water Urn')?.missing, 5);
  assert.equal(tweyen?.prerequisiteEvidence[0]?.state, 'unknown');
  assert.equal(model.weapons[0]?.wikiUrl.includes('fixture-weapon-instance'), false);
  assert.equal(model.stashes[0]?.quality, 'known');
});

test('selects Eternal Stage 1 Transcendence as the next target after 5-star', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-seofon', masterId: '3040036000', level: 100, uncap: 5, awakeningLevel: 9, updatedAt: 1 },
    ],
    accountStatus: { rank: 394, updatedAt: 1 },
    treasures: [
      { itemId: '5411', name: 'Silver Sword Shard', quantity: 75, updatedAt: 1 },
      { itemId: '552', name: 'Gale Rock', quantity: 60, updatedAt: 1 },
      { itemId: '5241', name: 'Wind Halo', quantity: 90, updatedAt: 1 },
      { itemId: '203', name: 'Damascus Crystal', quantity: 25, updatedAt: 1 },
    ],
    consumables: [
      { itemId: '20004', itemKindId: '17', group: '1', name: 'Gold Brick', quantity: 3, updatedAt: 1 },
    ],
  }));

  const seofon = model.eternals.find((card) => card.title === 'Seofon');
  assert.equal(seofon?.targetDisplay, 'Lv110');
  assert.equal(seofon?.targetReached, false);
  assert.match(seofon?.targetLabel ?? '', /Transcendence Stage 1/);
  assert.equal(seofon?.materialPlan.materials.find((row) => row.name === 'Gold Brick')?.missing, 0);
  assert.equal(seofon?.materialPlan.materials.find((row) => row.name === 'Silver Sword Shard')?.missing, 125);
  assert.equal(seofon?.prerequisiteEvidence.find((row) => row.label === 'Player Rank 150')?.satisfied, true);
  assert.equal(seofon?.prerequisiteEvidence.find((row) => row.label === 'Awakening 7')?.satisfied, true);
  assert.equal(seofon?.prerequisiteEvidence.find((row) => row.label.startsWith('Fourth skill'))?.state, 'unknown');
});

test('selects current Evoker Stage 1 target where supported and leaves unavailable higher targets truthful', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-caim', masterId: '3040164000', level: 100, uncap: 5, awakeningLevel: 10, updatedAt: 1 },
      { id: 'fixture-katzelia', masterId: '3040166000', level: 100, uncap: 5, awakeningLevel: 10, updatedAt: 1 },
    ],
    accountStatus: { rank: 394, updatedAt: 1 },
  }));
  const caim = model.evokers.find((card) => card.title === 'Caim');
  const katzelia = model.evokers.find((card) => card.title === 'Katzelia');
  assert.equal(caim?.targetDisplay, 'Lv110');
  assert.equal(caim?.targetReached, false);
  assert.match(caim?.targetLabel ?? '', /Transcendence Stage 1/);
  assert.equal(katzelia?.targetDisplay, '5★');
  assert.equal(katzelia?.targetReached, true);
  assert.match(katzelia?.notes[0] ?? '', /No currently supported higher target/);
});
