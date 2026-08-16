import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { buildDashboardViewModel } from '../dashboard/model.ts';
import { isVerifiedPassiveAccountUrl } from '../passive/page-observer.ts';
import { classifyPassiveResponseUrl } from '../passive/route.ts';
import { ingestAccountRecord } from './ingest.ts';

function npcRecord(rows: unknown[], capturedAt = 100): CapturedResponseRecord {
  return {
    id: `passive:${capturedAt}`,
    scanId: 'passive-account',
    meta: {
      requestId: String(capturedAt),
      url: 'https://game.granbluefantasy.jp/npc/list/1',
      resourceType: 'xhr',
      capturedAt,
    },
    body: {
      list: rows,
      first: 1,
      last: 1,
      prev: 0,
      next: 0,
      count: rows.length,
      current: 1,
      options: {
        number: rows.length,
        filter: { '5': '11110', '6': '000000' },
      },
    },
    categories: [],
  };
}

function characterRow(id: string, masterId: string): unknown {
  return {
    param: {
      id,
      level: '80',
      evolution: '4',
      arousal_level: '7',
    },
    master: { id: masterId },
  };
}

test('passive NPC list response reaches the account database and Characters view model', () => {
  const url = 'https://game.granbluefantasy.jp/npc/list/1?ignored=1';
  assert.equal(isVerifiedPassiveAccountUrl(url), true);
  assert.equal(classifyPassiveResponseUrl(url), 'account');

  const next = ingestAccountRecord(null, npcRecord([
    characterRow('fixture-instance-1', '3040001000'),
  ]));

  assert.ok(next);
  assert.equal(next.snapshot.characters.length, 1);
  assert.equal(next.snapshot.characters[0]?.id, 'fixture-instance-1');
  assert.equal(next.snapshot.characters[0]?.masterId, '3040001000');
  assert.equal(next.snapshot.characters[0]?.level, 80);
  assert.equal(next.snapshot.characters[0]?.uncap, 4);
  assert.equal(next.snapshot.characters[0]?.awakeningLevel, 7);

  const view = buildDashboardViewModel(next.snapshot);
  assert.equal(view.characters.length, 1);
  assert.equal(view.characters[0]?.key, 'character:fixture-instance-1');
});

test('malformed passive NPC rows stay omitted instead of becoming fake characters', () => {
  const next = ingestAccountRecord(null, npcRecord([
    { param: { id: 'fixture-instance-broken', level: '80' } },
  ]));

  assert.ok(next);
  assert.deepEqual(next.snapshot.characters, []);
  assert.equal(next.snapshot.quality.characters, 'partial');
});

test('NPC-like paths outside the approved GBF origin are rejected', () => {
  const url = 'https://example.com/npc/list/1';
  assert.equal(isVerifiedPassiveAccountUrl(url), false);
  assert.equal(classifyPassiveResponseUrl(url), null);
});
