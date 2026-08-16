import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DASHBOARD_NAV_GROUPS,
  dashboardDestination,
  searchDashboardDestinations,
} from './navigation.ts';

test('keeps overview, detail and system navigation explicit with goals beside overview', () => {
  assert.deepEqual(DASHBOARD_NAV_GROUPS.map((group) => group.label), ['Overview', 'Detail', 'System']);
  assert.deepEqual(DASHBOARD_NAV_GROUPS[0]?.destinations, ['overview', 'goals']);
  assert.ok(DASHBOARD_NAV_GROUPS[1]?.destinations.includes('roster'));
  assert.deepEqual(DASHBOARD_NAV_GROUPS.at(-1)?.destinations, ['settings', 'developer']);
});

test('searches only declared local dashboard destinations', () => {
  assert.equal(searchDashboardDestinations('combat')[0]?.key, 'combat');
  assert.equal(searchDashboardDestinations('pins')[0]?.key, 'goals');
  assert.equal(searchDashboardDestinations('utility')[0]?.key, 'roster');
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

test('goals and roster are local controller destinations and not GBF network actions', () => {
  assert.equal(dashboardDestination('goals').owner, 'goals');
  assert.equal(dashboardDestination('goals').group, 'overview');
  assert.equal(dashboardDestination('roster').owner, 'roster');
  assert.equal(dashboardDestination('roster').group, 'detail');
});
