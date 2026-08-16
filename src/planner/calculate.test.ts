import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGoal } from './calculate.ts';
import type { UpgradeGoal } from './types.ts';
import type { AccountSnapshot } from '../types/account.ts';

function snapshot(treasures: AccountSnapshot['treasures']): AccountSnapshot {
  return {
    characters: [],
    weapons: [],
    summons: [],
    artifacts: [],
    weaponStashes: [],
    treasures,
    consumables: [],
    tickets: [],
    progression: [],
    quality: {
      characters: 'unknown',
      weapons: 'unknown',
      summons: 'unknown',
      artifacts: 'unknown',
      treasures: 'partial',
      consumables: 'unknown',
      tickets: 'unknown',
      accountStatus: 'unknown',
      progression: 'unknown',
    },
    capturedAt: 1,
  };
}

const goal: UpgradeGoal = {
  id: 'fixture-goal',
  label: 'Fixture target',
  characterMasterId: 'fixture-character',
  targetUncap: 5,
  requirements: [
    { id: 'known', itemId: '1', name: 'Known Item', quantity: 10, source: 'treasures' },
    { id: 'missing', itemId: '2', name: 'Unobserved Item', quantity: 4, source: 'treasures' },
    { id: 'rupies', name: 'Rupies', quantity: 100_000, source: 'untracked' },
  ],
};

test('calculates proven material shortfalls, clamps at zero, and leaves missing inventory unknown', () => {
  const result = calculateGoal(goal, snapshot([
    { itemId: '1', name: 'Known Item', quantity: 12, updatedAt: 1 },
  ]));

  assert.equal(result.quality, 'partial');
  assert.equal(result.complete, undefined);
  assert.deepEqual(result.materials[0], {
    ...goal.requirements[0],
    state: 'known',
    owned: 12,
    missing: 0,
  });
  assert.equal(result.materials[1]?.state, 'unknown');
  assert.equal(result.materials[1]?.owned, undefined);
  assert.equal(result.materials[2]?.state, 'unknown');
});

test('reports a fully known goal complete only when every explicit quantity is observed', () => {
  const fullyTracked: UpgradeGoal = {
    ...goal,
    requirements: [
      { id: 'a', itemId: '1', name: 'A', quantity: 5, source: 'treasures' },
      { id: 'b', itemId: '2', name: 'B', quantity: 3, source: 'treasures' },
    ],
  };
  const account = snapshot([
    { itemId: '1', quantity: 5, updatedAt: 1 },
    { itemId: '2', quantity: 4, updatedAt: 1 },
  ]);
  account.quality.treasures = 'known';
  const result = calculateGoal(fullyTracked, account);
  assert.equal(result.quality, 'known');
  assert.equal(result.complete, true);
});


test('keeps goal quality partial when a required inventory family is only partially covered', () => {
  const fullyTracked: UpgradeGoal = {
    ...goal,
    requirements: [
      { id: 'a', itemId: '1', name: 'A', quantity: 5, source: 'treasures' },
    ],
  };
  const account = snapshot([
    { itemId: '1', quantity: 5, updatedAt: 1 },
  ]);
  account.quality.treasures = 'partial';

  const result = calculateGoal(fullyTracked, account);
  assert.equal(result.materials[0]?.state, 'known');
  assert.equal(result.materials[0]?.missing, 0);
  assert.equal(result.quality, 'partial');
  assert.equal(result.complete, undefined);
});

test('matches consumable requirements by group and item kind instead of item id alone', () => {
  const contextual: UpgradeGoal = {
    id: 'contextual-consumable',
    label: 'Contextual consumable',
    characterMasterId: 'fixture-character',
    targetUncap: 6,
    requirements: [
      { id: 'brick', itemId: '1', itemKindId: '17', group: 'uncap', name: 'Fixture Brick', quantity: 2, source: 'consumables' },
    ],
  };
  const base = snapshot([]);
  base.consumables = [
    { itemId: '1', itemKindId: '99', group: 'recovery', quantity: 99, updatedAt: 1 },
    { itemId: '1', itemKindId: '17', group: 'uncap', quantity: 1, updatedAt: 1 },
  ];
  const result = calculateGoal(contextual, base);
  assert.equal(result.materials[0]?.owned, 1);
  assert.equal(result.materials[0]?.missing, 1);
});

test('can match a verified treasure by an exact unique name and preserves its observed technical id', () => {
  const named: UpgradeGoal = {
    id: 'named-treasure',
    label: 'Named treasure',
    characterMasterId: 'fixture-character',
    targetUncap: 6,
    targetLevel: 120,
    requirements: [
      { id: 'named', name: 'Fixture Named Treasure', quantity: 10, source: 'treasures' },
    ],
  };
  const account = snapshot([
    { itemId: 'fixture-id', name: 'Fixture Named Treasure', quantity: 7, updatedAt: 1 },
  ]);
  account.quality.treasures = 'known';
  const result = calculateGoal(named, account);
  assert.equal(result.materials[0]?.state, 'known');
  assert.equal(result.materials[0]?.itemId, 'fixture-id');
  assert.equal(result.materials[0]?.owned, 7);
  assert.equal(result.materials[0]?.missing, 3);
});

test('does not guess by name when multiple treasure rows share the same display name', () => {
  const named: UpgradeGoal = {
    id: 'ambiguous-treasure',
    label: 'Ambiguous treasure',
    characterMasterId: 'fixture-character',
    targetUncap: 6,
    requirements: [
      { id: 'named', name: 'Fixture Duplicate', quantity: 1, source: 'treasures' },
    ],
  };
  const account = snapshot([
    { itemId: 'a', name: 'Fixture Duplicate', quantity: 4, updatedAt: 1 },
    { itemId: 'b', name: 'Fixture Duplicate', quantity: 9, updatedAt: 1 },
  ]);
  account.quality.treasures = 'known';
  const result = calculateGoal(named, account);
  assert.equal(result.materials[0]?.state, 'unknown');
  assert.equal(result.materials[0]?.itemId, undefined);
});
