import assert from 'node:assert/strict';
import test from 'node:test';
import { launchDashboardWithObservation } from './dashboard-launch.ts';

function status(active: boolean, error?: string) {
  return {
    version: 1 as const,
    captureReady: true as const,
    active,
    message: active ? 'Observation active' : 'Observation inactive',
    scan: null,
    error,
  };
}

test('dashboard launch starts observation before opening when inactive', async () => {
  const calls: string[] = [];
  const result = await launchDashboardWithObservation({
    getStatus: async () => {
      calls.push('status');
      return status(false);
    },
    startObservation: async () => {
      calls.push('start');
      return status(true);
    },
    openDashboard: async () => {
      calls.push('open');
    },
  });

  assert.equal(result.active, true);
  assert.deepEqual(calls, ['status', 'start', 'open']);
});

test('dashboard launch does not attach twice when observation is already active', async () => {
  const calls: string[] = [];
  const result = await launchDashboardWithObservation({
    getStatus: async () => {
      calls.push('status');
      return status(true);
    },
    startObservation: async () => {
      calls.push('start');
      return status(true);
    },
    openDashboard: async () => {
      calls.push('open');
    },
  });

  assert.equal(result.active, true);
  assert.deepEqual(calls, ['status', 'open']);
});

test('dashboard launch does not open when observation cannot start on the active tab', async () => {
  const calls: string[] = [];
  await assert.rejects(
    launchDashboardWithObservation({
      getStatus: async () => {
        calls.push('status');
        return status(false);
      },
      startObservation: async () => {
        calls.push('start');
        return status(false, 'Open game.granbluefantasy.jp in the active tab before starting observation.');
      },
      openDashboard: async () => {
        calls.push('open');
      },
    }),
    /Open game\.granbluefantasy\.jp/,
  );
  assert.deepEqual(calls, ['status', 'start']);
});
