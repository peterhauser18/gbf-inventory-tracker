import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  dashboardThemeButtonLabel,
  nextDashboardTheme,
  parseDashboardTheme,
} from './theme.ts';

const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');

test('defaults missing or invalid theme values to Compact Analyst dark', () => {
  assert.equal(parseDashboardTheme(null), 'dark');
  assert.equal(parseDashboardTheme(undefined), 'dark');
  assert.equal(parseDashboardTheme('system'), 'dark');
  assert.equal(parseDashboardTheme('dark'), 'dark');
});

test('dashboard first paint is dark before the theme controller runs', () => {
  assert.match(dashboardHtml, /<html\s+lang="en"\s+data-theme="dark">/);
});

test('accepts the persisted light theme value', () => {
  assert.equal(parseDashboardTheme('light'), 'light');
});

test('toggles between light and dark with the matching action label', () => {
  assert.equal(nextDashboardTheme('light'), 'dark');
  assert.equal(nextDashboardTheme('dark'), 'light');
  assert.equal(dashboardThemeButtonLabel('light'), 'Dark mode');
  assert.equal(dashboardThemeButtonLabel('dark'), 'Light mode');
});
