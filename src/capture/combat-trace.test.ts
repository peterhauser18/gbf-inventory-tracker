import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendCombatCaptureTrace,
  combatCaptureTracePath,
  sanitizeCombatCaptureTrace,
} from './combat-trace.ts';
import type { CombatCaptureTraceEntry } from './types.ts';

test('combat trace recognizes only exact approved battle-family paths on the GBF game origin', () => {
  assert.equal(
    combatCaptureTracePath('https://game.granbluefantasy.jp/rest/raid/start.json?_=123'),
    '/rest/raid/start.json',
  );
  assert.equal(
    combatCaptureTracePath('https://game.granbluefantasy.jp/rest/multiraid/ability_result.json'),
    '/rest/multiraid/ability_result.json',
  );
  assert.equal(
    combatCaptureTracePath('https://example.com/rest/raid/start.json'),
    undefined,
  );
  assert.equal(
    combatCaptureTracePath('https://game.granbluefantasy.jp/rest/raid/retire.json'),
    undefined,
  );
  assert.equal(
    combatCaptureTracePath('https://game.granbluefantasy.jp/resultmulti/content/index/private-instance'),
    undefined,
  );
});

test('combat trace sanitization keeps only stage, exact safe path, and timestamp', () => {
  const trace = sanitizeCombatCaptureTrace([
    { at: 10, path: '/rest/raid/start.json', stage: 'response-seen', requestId: 'must-not-survive' },
    { at: 11, path: '/rest/raid/ability_result.json', stage: 'ingest-success', raid_id: 'must-not-survive' },
    { at: 12, path: '/rest/raid/retire.json', stage: 'response-seen' },
    { at: 13, path: '/rest/raid/start.json', stage: 'unknown-stage' },
  ]);

  assert.deepEqual(trace, [
    { at: 10, path: '/rest/raid/start.json', stage: 'response-seen' },
    { at: 11, path: '/rest/raid/ability_result.json', stage: 'ingest-success' },
  ]);
  assert.equal('requestId' in (trace[0] as object), false);
  assert.equal('raid_id' in (trace[1] as object), false);
});

test('combat trace remains bounded to the newest forty entries', () => {
  let trace: CombatCaptureTraceEntry[] = [];
  for (let index = 0; index < 50; index += 1) {
    trace = appendCombatCaptureTrace(trace, {
      at: index,
      path: '/rest/raid/start.json',
      stage: 'queued',
    });
  }
  assert.equal(trace.length, 40);
  assert.equal(trace[0]?.at, 10);
  assert.equal(trace[39]?.at, 49);
});
