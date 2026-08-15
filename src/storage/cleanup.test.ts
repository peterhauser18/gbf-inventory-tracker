import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupLocalData } from './cleanup.ts';

test('diagnostic cleanup clears only diagnostic data', async () => {
  const state = { diagnostic: true, combat: true, account: 'snapshot-v1', theme: 'dark' };
  await cleanupLocalData('diagnostic', {
    clearDiagnostic: async () => { state.diagnostic = false; },
    clearCombat: async () => { state.combat = false; },
  });
  assert.deepEqual(state, {
    diagnostic: false,
    combat: true,
    account: 'snapshot-v1',
    theme: 'dark',
  });
});

test('all-except-account cleanup clears diagnostic and combat data while preserving snapshot and UI preferences', async () => {
  const state = { diagnostic: true, combat: true, account: 'snapshot-v1', theme: 'dark' };
  await cleanupLocalData('all-except-account', {
    clearDiagnostic: async () => { state.diagnostic = false; },
    clearCombat: async () => { state.combat = false; },
  });
  assert.deepEqual(state, {
    diagnostic: false,
    combat: false,
    account: 'snapshot-v1',
    theme: 'dark',
  });
});
