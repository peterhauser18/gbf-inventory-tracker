import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
const treasureUi = readFileSync(new URL('./treasure-ui.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');

test('dashboard boot does not eagerly build the full treasure card inventory', () => {
  assert.match(model, /DASHBOARD_TREASURE_PREVIEW_LIMIT = 200/);
  assert.match(model, /snapshot\.treasures\.slice\(0, DASHBOARD_TREASURE_PREVIEW_LIMIT\)\.map/);
  assert.match(model, /count: snapshot\.treasures\.length/);
});

test('treasure navigation uses a full local snapshot with bounded page rendering', () => {
  assert.match(dashboard, /src\/dashboard\/treasure-ui\.ts/);
  assert.match(treasureUi, /const PAGE_SIZE = 100/);
  assert.match(treasureUi, /treasures = account\.snapshot\.treasures/);
  assert.match(treasureUi, /filtered\.slice\(start, start \+ PAGE_SIZE\)/);
  assert.match(treasureUi, /data-treasure-search/);
  assert.match(treasureUi, /data-treasure-page="next"/);
});

test('treasure view stays local and does not add GBF request primitives', () => {
  assert.doesNotMatch(treasureUi, /\bfetch\s*\(/);
  assert.doesNotMatch(treasureUi, /XMLHttpRequest/);
  assert.doesNotMatch(treasureUi, /chrome\.debugger/);
  assert.doesNotMatch(treasureUi, /game\.granbluefantasy\.jp/);
});
