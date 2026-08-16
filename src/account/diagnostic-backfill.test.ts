import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCaptureScan } from '../capture/normalize.ts';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { buildDashboardViewModel } from '../dashboard/model.ts';
import { createAccountDatabase } from './database.ts';
import { mergeCharactersFromCapturedRecords } from './diagnostic-backfill.ts';

function record(path: string, body: unknown, capturedAt = 100, requestId = String(capturedAt)): CapturedResponseRecord {
  return {
    id: `scan:${requestId}`,
    scanId: 'completed-scan',
    meta: {
      requestId,
      url: `https://game.granbluefantasy.jp${path}`,
      resourceType: 'xhr',
      capturedAt,
    },
    body,
    categories: [],
  };
}

function observedNpcPage(
  rows: unknown[],
  capturedPage = 1,
  lastPage = 1,
  count = rows.length,
  held = count,
): CapturedResponseRecord {
  // Minimal sanitized structure matching the real /npc/list rows previously validated
  // against the private scan used for PR #9. All fixture IDs/names are synthetic.
  return record(`/npc/list/${capturedPage}`, {
    list: rows,
    first: 1,
    last: lastPage,
    prev: capturedPage - 1,
    next: capturedPage < lastPage ? capturedPage + 1 : 0,
    count,
    current: capturedPage,
    options: {
      number: held,
      filter: { '5': '11110', '6': '000000' },
    },
  }, 100 + capturedPage, `npc-${capturedPage}`);
}

function characterRow(id: string, masterId: string, level = '80'): unknown {
  return {
    param: {
      id,
      level,
      evolution: '4',
      arousal_level: '7',
    },
    master: { id: masterId },
  };
}

test('backfills a realistic sanitized NPC page into snapshot.characters and dashboard cards', () => {
  const next = mergeCharactersFromCapturedRecords(null, [
    observedNpcPage([characterRow('fixture-instance-1', '3040001000')]),
  ]);

  assert.ok(next);
  assert.equal(next.snapshot.characters.length, 1);
  assert.deepEqual(next.snapshot.characters[0], {
    id: 'fixture-instance-1',
    masterId: '3040001000',
    level: 80,
    uncap: 4,
    awakeningLevel: 7,
    updatedAt: 101,
  });
  assert.equal(next.snapshot.quality.characters, 'known');

  const view = buildDashboardViewModel(next.snapshot);
  assert.equal(view.characters.length, 1);
  assert.equal(view.characters[0]?.key, 'character:fixture-instance-1');
  assert.equal(view.characters[0]?.title, 'Character 3040001000');
});

test('malformed observed NPC rows stay omitted and keep character coverage partial', () => {
  const next = mergeCharactersFromCapturedRecords(null, [
    observedNpcPage([{ param: { id: 'fixture-instance-broken', level: '80' } }]),
  ]);

  assert.ok(next);
  assert.deepEqual(next.snapshot.characters, []);
  assert.equal(next.snapshot.quality.characters, 'partial');
});

test('multi-page NPC backfill preserves pagination completeness semantics', () => {
  const next = mergeCharactersFromCapturedRecords(null, [
    observedNpcPage([characterRow('fixture-instance-1', '3040001000')], 1, 2, 2, 2),
    observedNpcPage([characterRow('fixture-instance-2', '3040002000')], 2, 2, 2, 2),
  ]);

  assert.ok(next);
  assert.equal(next.snapshot.characters.length, 2);
  assert.equal(next.snapshot.quality.characters, 'known');

  const partial = mergeCharactersFromCapturedRecords(null, [
    observedNpcPage([characterRow('fixture-instance-1', '3040001000')], 1, 2, 2, 2),
  ]);
  assert.ok(partial);
  assert.equal(partial.snapshot.quality.characters, 'partial');
});

test('older diagnostic character data cannot overwrite newer cumulative character facts', () => {
  const newer = normalizeCaptureScan([
    record('/npc/list/1', {
      list: [characterRow('fixture-instance-1', '3040001000', '100')],
      current: 1,
      last: 1,
      count: 1,
      options: { number: 1, filter: { '5': '11110', '6': '000000' } },
    }, 500, 'newer'),
  ]);
  const current = createAccountDatabase(newer);

  const olderRecord = observedNpcPage([characterRow('fixture-instance-1', '3040001000', '80')]);
  olderRecord.meta.capturedAt = 101;
  const next = mergeCharactersFromCapturedRecords(current, [olderRecord]);

  assert.ok(next);
  assert.equal(next.snapshot.characters[0]?.level, 100);
  assert.equal(next.observedAt.characters, 500);
});

test('non-character diagnostic records do not alter the account database', () => {
  const current = createAccountDatabase(normalizeCaptureScan([
    record('/weapon/list/1', {
      list: [{ param: { id: 'weapon-instance', level: '10' }, master: { id: '1040000000' } }],
      current: 1,
      last: 1,
      count: 1,
      options: { number: 1, filter: { '5': '11110', '6': '000000' } },
    }, 200, 'weapon'),
  ]));
  const next = mergeCharactersFromCapturedRecords(current, [
    record('/weapon/list/1', { list: [] }, 300, 'other'),
  ]);

  assert.equal(next, current);
});
