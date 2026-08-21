import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const raidHistoryCompact = readFileSync(new URL('./raid-history-compact.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard-v2.ts', import.meta.url), 'utf8');
const raidHistoryCss = readFileSync(new URL('./raid-history-compact.css', import.meta.url), 'utf8');

test('Raid History pagination is rendered before the list and pages data before building cockpits', () => {
  assert.match(dashboard, /const RAIDS_PER_PAGE = 5/);
  assert.match(dashboard, /const visibleRaids = raids\.slice\(start, start \+ RAIDS_PER_PAGE\)/);
  assert.match(dashboard, /\$\{raids\.length > RAIDS_PER_PAGE \? this\.renderRaidPagination\(totalPages\) : ''\}[\s\S]*class="raid-list"/);
  assert.match(dashboard, /visibleRaids\.map\(\(raid\) => this\.renderRaid\(raid, layout\)\)/);
  assert.doesNotMatch(dashboard, /raids\.map\(\(raid\) => this\.renderRaid/);
  assert.doesNotMatch(raidHistoryCompact, /card\.hidden|querySelectorAll<HTMLElement>\(':scope > \.raid-card'\)/);
  assert.match(raidHistoryCss, /\.raids-compact-header \+ \[data-combat-section\] > \.raid-pagination\s*\{[^}]*margin-top:\s*0/s);
});
