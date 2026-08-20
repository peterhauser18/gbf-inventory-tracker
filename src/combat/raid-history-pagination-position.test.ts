import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const raidHistoryCompact = readFileSync(new URL('./raid-history-compact.ts', import.meta.url), 'utf8');
const raidHistoryCss = readFileSync(new URL('./raid-history-compact.css', import.meta.url), 'utf8');

test('Raid History pagination sits directly below Search and outside the raid list', () => {
  assert.match(raidHistoryCompact, /root\.parentElement\?\.querySelector<HTMLElement>\('\[data-raid-pagination\]'\)\?\.remove\(\)/);
  assert.match(raidHistoryCompact, /const pagination = renderPagination\(totalPages, root\)/);
  assert.match(raidHistoryCompact, /root\.before\(pagination\)/);
  assert.match(raidHistoryCompact, /if \(root\.isConnected\) applyCompactRaidHistory\(root, lastQuery\)/);
  assert.match(raidHistoryCss, /\.raids-compact-header \+ \.raid-pagination\s*\{[^}]*margin-top:\s*0/s);
});
