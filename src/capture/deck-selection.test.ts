import assert from 'node:assert/strict';
import test from 'node:test';
import { parseObservedDeckSelectionRequest } from './deck-selection.ts';

test('host quest selection reads only deck_id from the verified game request', () => {
  const selection = parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/create_quest?ignored=1',
    'POST',
    JSON.stringify({ deck_id: 113, quest_id: 305621, unrelated_value: 'ignored' }),
  );
  assert.deepEqual(selection, { deckId: '113', source: 'host' });
});

test('raid join selection reads user_deck_priority and the target raid id', () => {
  const selection = parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/raid_deck_data_create',
    'POST',
    JSON.stringify({ user_deck_priority: '151', raid_id: 46423315602, select_bp: 3 }),
  );
  assert.deepEqual(selection, { deckId: '151', raidId: '46423315602', source: 'join' });
});

test('deck selection parser fails closed for unrelated, foreign, malformed, incomplete, or non-POST requests', () => {
  assert.equal(parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/create_quest',
    'GET',
    JSON.stringify({ deck_id: 113 }),
  ), null);
  assert.equal(parseObservedDeckSelectionRequest(
    'https://example.com/quest/create_quest',
    'POST',
    JSON.stringify({ deck_id: 113 }),
  ), null);
  assert.equal(parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/other',
    'POST',
    JSON.stringify({ deck_id: 113 }),
  ), null);
  assert.equal(parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/create_quest',
    'POST',
    '{bad json',
  ), null);
  assert.equal(parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/create_quest',
    'POST',
    JSON.stringify({ deck_id: 0 }),
  ), null);
  assert.equal(parseObservedDeckSelectionRequest(
    'https://game.granbluefantasy.jp/quest/raid_deck_data_create',
    'POST',
    JSON.stringify({ user_deck_priority: 151 }),
  ), null);
});
