import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatLoadoutOpenState } from './loadout-open-state.ts';

test('weapon grid open state survives removal and recreation of its details element', () => {
  const state = new CombatLoadoutOpenState();
  const owner = 'active:raid-instance';

  assert.equal(state.resolve(owner), false);
  state.remember(owner, true);
  assert.equal(state.resolve(owner), true);
  assert.equal(state.resolve(owner, true), true);
  assert.equal(state.resolve(owner), true);

  state.remember(owner, false);
  assert.equal(state.resolve(owner), false);
});

test('open state is isolated per active/history owner', () => {
  const state = new CombatLoadoutOpenState();
  state.remember('active:one', true);
  state.remember('history:one', false);

  assert.equal(state.resolve('active:one'), true);
  assert.equal(state.resolve('history:one'), false);
  assert.equal(state.resolve('active:two'), false);
});
