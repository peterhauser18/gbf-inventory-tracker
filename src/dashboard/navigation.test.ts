import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DASHBOARD_NAV_GROUPS,
  dashboardDestination,
  searchDashboardDestinations,
} from './navigation.ts';

test('keeps overview, detail and system navigation explicit', () => {
  assert.deepEqual(DASHBOARD_NAV_GROUPS.map((group) => group.label), ['Overview', 'Detail', 'System']);
  assert.deepEqual(DASHBOARD_NAV_GROUPS.at(-1)?.destinations, ['settings', 'developer']);
});

test('searches only declared local dashboard destinations', () => {
  assert.equal(searchDashboardDestinations('combat')[0]?.key, 'combat');
  assert.equal(searchDashboardDestinations('storage')[0]?.key, 'developer');
  assert.equal(searchDashboardDestinations('theme')[0]?.key, 'settings');
  assert.deepEqual(searchDashboardDestinations('not-a-real-destination'), []);
});

test('inventory keyword finds relevant local detail destinations without inventing an action', () => {
  const keys = searchDashboardDestinations('inventory').map((destination) => destination.key);
  assert.ok(keys.includes('characters'));
  assert.ok(keys.includes('weapons'));
  assert.ok(keys.includes('summons'));
  assert.ok(keys.includes('treasures'));
  assert.ok(keys.every((key) => dashboardDestination(key).owner === 'dashboard'));
});
