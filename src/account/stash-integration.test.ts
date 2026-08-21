import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { createAccountDatabase, mergeAccountDatabase } from './database.ts';
import { normalizeVerifiedAccountRecord } from './ingest.ts';

function stashRecord(capturedAt = 100): CapturedResponseRecord {
  return {
    id: `scan:stash-${capturedAt}`,
    scanId: 'scan',
    meta: {
      requestId: `stash-${capturedAt}`,
      url: 'https://game.granbluefantasy.jp/weapon/container_list/1/7',
      resourceType: 'xhr',
      capturedAt,
    },
    body: {
      list: [{
        param: { id: 'stash-weapon-1', level: '150', skill_level: '15', evolution: '4' },
        master: { id: '1040000001', name: 'Stored Blade' },
      }],
      first: 1,
      last: 1,
      prev: 0,
      next: 0,
      count: 1,
      current: 1,
      options: { number: 1, filter: { '5': '00110', '6': '000000' } },
    },
    categories: ['weapons', 'roster'],
  };
}

test('observed stash name is attached to the stash and contained weapon joins owned weapon inventory', () => {
  const snapshot = normalizeVerifiedAccountRecord(stashRecord(), { weaponStashName: 'Fire Grid Archive' });
  assert.ok(snapshot);
  assert.equal(snapshot.weaponStashes[0]?.name, 'Fire Grid Archive');

  const database = createAccountDatabase(snapshot);
  assert.equal(database.snapshot.weaponStashes[0]?.name, 'Fire Grid Archive');
  assert.equal(database.snapshot.weapons.length, 1);
  assert.equal(database.snapshot.weapons[0]?.id, 'stash-weapon-1');
  assert.equal(database.snapshot.quality.weapons, 'unknown');
});

test('later stash observations without metadata preserve the last observed name and dedupe the same weapon instance', () => {
  const named = normalizeVerifiedAccountRecord(stashRecord(100), { weaponStashName: 'Fire Grid Archive' })!;
  const unnamed = normalizeVerifiedAccountRecord(stashRecord(200))!;
  unnamed.weaponStashes[0]!.weapons[0]!.level = 200;

  const merged = mergeAccountDatabase(createAccountDatabase(named), unnamed);
  assert.equal(merged.snapshot.weaponStashes[0]?.name, 'Fire Grid Archive');
  assert.equal(merged.snapshot.weapons.length, 1);
  assert.equal(merged.snapshot.weapons[0]?.level, 200);
});
