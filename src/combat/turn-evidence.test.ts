import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { summarizeTurns } from './analytics.ts';
import type { NormalizedRaidParse } from './types.ts';

function emptyRaid(): NormalizedRaidParse {
  return {
    schemaVersion: 1,
    raidTechnicalId: 'turn-fixture',
    result: 'active',
    resultQuality: 'unknown',
    parserQuality: 'partial',
    damageQuality: 'unknown',
    characterDamage: [],
    stats: { quality: 'unknown' },
    log: [],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: false, terminalObserved: false, parseGapObserved: false },
    lastObservedAt: 1,
  };
}

test('last directly observed payload turn is usable without inventing per-turn damage', () => {
  const raid = { ...emptyRaid(), lastObservedTurn: 7 };
  assert.deepEqual(summarizeTurns(raid), {
    currentTurn: 7,
    currentTurnDamage: undefined,
    previousTurnDamage: undefined,
  });
});

test('combat storage only preserves an explicit top-level turn value', () => {
  const source = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
  assert.match(source, /\(body as Record<string, unknown>\)\.turn/);
  assert.match(source, /Number\.isInteger\(parsed\)/);
  assert.match(source, /next\.lastObservedTurn = Math\.max/);
  assert.doesNotMatch(source, /actions\.length\s*[+*/-]\s*1/);
});
