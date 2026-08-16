import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const farming = readFileSync(new URL('./farming-ui.ts', import.meta.url), 'utf8');

test('Farming skips account and raid reads when no goals are pinned', () => {
  const start = farming.indexOf('async function refreshLocalData');
  const end = farming.indexOf('function handleClick', start);
  assert.ok(start >= 0 && end > start);
  const refresh = farming.slice(start, end);

  const pins = refresh.indexOf('const pins = readPins()');
  const noPins = refresh.indexOf('if (pins.length === 0)', pins);
  const account = refresh.indexOf('await loadAccountDatabase()', noPins);
  assert.ok(pins >= 0);
  assert.ok(noPins > pins);
  assert.ok(account > noPins);
});

test('Farming resolves proven deficits before reading combat IndexedDB state', () => {
  const start = farming.indexOf('async function refreshLocalData');
  const end = farming.indexOf('function handleClick', start);
  const refresh = farming.slice(start, end);

  const account = refresh.indexOf('await loadAccountDatabase()');
  const deficits = refresh.indexOf('aggregatePinnedMaterialDeficits(activeGoals)', account);
  const noDeficits = refresh.indexOf('if (deficits.length === 0)', deficits);
  const history = refresh.indexOf('await getRaidHistory()', noDeficits);
  const preferences = refresh.indexOf('await getAllDropPreferences()', history);
  assert.ok(account >= 0);
  assert.ok(deficits > account);
  assert.ok(noDeficits > deficits);
  assert.ok(history > noDeficits);
  assert.ok(preferences > history);
  assert.doesNotMatch(refresh, /Promise\.all\s*\(/);
});

test('Farming syncs only from explicit local events instead of observing every Dashboard mutation', () => {
  assert.doesNotMatch(farming, /new MutationObserver\s*\(/);
  assert.match(farming, /closest<HTMLButtonElement>\('\[data-goal-pin\]'\)/);
  assert.match(farming, /\.nav-item\[data-section=\\"overview\\"\], \.nav-item\[data-section=\\"goals\\"\]/);
  assert.match(farming, /\.finally\(\(\) => \{[\s\S]*scheduleSync\(\)/);
  assert.doesNotMatch(farming, /setInterval\s*\(/);
});
