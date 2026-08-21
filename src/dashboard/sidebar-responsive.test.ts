import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('./sidebar-responsive.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./sidebar-responsive.css', import.meta.url), 'utf8');

test('Dashboard sidebar is manually collapsible without rerendering Combat content', () => {
  assert.match(dashboardHtml, /src="\/src\/dashboard\/sidebar-responsive\.ts"/);
  assert.match(sidebar, /SIDEBAR_COLLAPSED_KEY/);
  assert.match(sidebar, /localStorage\.getItem\(SIDEBAR_COLLAPSED_KEY\)/);
  assert.match(sidebar, /localStorage\.setItem\(SIDEBAR_COLLAPSED_KEY, String\(value\)\)/);
  assert.match(sidebar, /shell\.classList\.toggle\('dashboard-sidebar-collapsed', collapsed\)/);
  assert.doesNotMatch(sidebar, /innerHTML\s*=|replaceChildren\(/);
});

test('collapsed sidebar hover and keyboard focus overlay content instead of widening the grid track', () => {
  assert.match(css, /\.dashboard-shell\.dashboard-sidebar-collapsed\s*\{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\)/s);
  assert.match(css, /dashboard-sidebar-collapsed \.sidebar\s*\{[^}]*width:\s*52px/s);
  assert.match(css, /dashboard-sidebar-collapsed \.sidebar:hover,[\s\S]*\.sidebar:focus-within\s*\{[^}]*width:\s*220px/s);
  assert.doesNotMatch(css, /dashboard-sidebar-collapsed:hover\s*\{[^}]*grid-template-columns/s);
});

test('Dashboard can shrink below the old hard minimum while the Character table owns horizontal scrolling', () => {
  assert.match(css, /html body\s*\{[^}]*min-width:\s*0 !important/s);
  assert.match(css, /\.dashboard-shell \.preset-combat-cockpit \.cockpit-table\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
});

test('Dashboard Combat keeps five KPIs as a visible balanced 3 plus 2 strip', () => {
  assert.match(css, /\.combat-live-stats\s*\{[^}]*display:\s*grid !important[^}]*repeat\(6, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.live-stat\s*\{[^}]*grid-column:\s*span 2/s);
  assert.match(css, /\.live-stat:nth-child\(4\),[\s\S]*\.live-stat:nth-child\(5\)\s*\{[^}]*grid-column:\s*span 3[^}]*display:\s*grid !important/s);
});

test('medium Dashboard Combat widths render the six Character cards as 4 plus 2', () => {
  assert.match(css, /@media \(max-width: 900px\) and \(min-width: 561px\)[\s\S]*party-cards-compact\s*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/s);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*party-cards-compact\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
});
