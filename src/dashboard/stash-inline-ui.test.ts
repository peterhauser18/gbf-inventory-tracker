import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync(new URL('../dashboard.ts', import.meta.url), 'utf8');
const globalSearch = readFileSync(new URL('./global-entity-search-ui.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('./stash-inline.ts', import.meta.url), 'utf8');

test('Stashes section renders inline instead of using stash child detail content', () => {
  assert.match(dashboard, /section === 'stashes'\) return renderInlineStashCollection\(view\.stashes, query, expandedStashes\)/);
  assert.doesNotMatch(dashboard, /Weapons in this stash/);
  assert.match(renderer, /data-stash-toggle=/);
  assert.match(renderer, /data-stash-children=/);
});

test('stash expansion state is independent and retained across ordinary renders', () => {
  assert.match(dashboard, /const expandedStashes = new Set<string>\(\)/);
  assert.match(dashboard, /if \(expandedStashes\.has\(key\)\) expandedStashes\.delete\(key\)/);
  assert.match(dashboard, /else expandedStashes\.add\(key\)/);
  assert.doesNotMatch(dashboard, /expandedStashes\.clear\(\)/);
});

test('inline stash children reuse the existing weapon detail control with provenance', () => {
  assert.match(renderer, /data-stash-parent=/);
  assert.match(renderer, /data-stash-child=/);
  assert.match(renderer, /data-detail=/);
  assert.match(dashboard, /querySelectorAll<HTMLButtonElement>\('\[data-detail\]'\)/);
});

test('global entity search expands a stash parent before opening a stash weapon', () => {
  const toggle = globalSearch.indexOf("'[data-stash-toggle]'");
  const detail = globalSearch.indexOf("'[data-detail]'", toggle);
  assert.ok(toggle >= 0);
  assert.ok(detail > toggle);
  assert.match(globalSearch, /button\.dataset\.stashToggle === detailKey/);
  assert.match(globalSearch, /stashToggle\.getAttribute\('aria-expanded'\) !== 'true'/);
});

test('inline stash renderer remains local-only', () => {
  assert.doesNotMatch(renderer, /\bfetch\s*\(|chrome\.debugger|chrome\.runtime|game\.granbluefantasy\.jp/);
});
