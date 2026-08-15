import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardThemeButtonLabel,
  nextDashboardTheme,
  parseDashboardTheme,
} from './theme.ts';

test('defaults missing or invalid theme values to light', () => {
  assert.equal(parseDashboardTheme(null), 'light');
  assert.equal(parseDashboardTheme(undefined), 'light');
  assert.equal(parseDashboardTheme('system'), 'light');
  assert.equal(parseDashboardTheme('light'), 'light');
});

test('accepts the persisted dark theme value', () => {
  assert.equal(parseDashboardTheme('dark'), 'dark');
});

test('toggles between light and dark with the matching action label', () => {
  assert.equal(nextDashboardTheme('light'), 'dark');
  assert.equal(nextDashboardTheme('dark'), 'light');
  assert.equal(dashboardThemeButtonLabel('light'), 'Dark mode');
  assert.equal(dashboardThemeButtonLabel('dark'), 'Light mode');
});
