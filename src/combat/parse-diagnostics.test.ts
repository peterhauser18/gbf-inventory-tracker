import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
} from './complete-observation.ts';
import { parseRaidParseExport, serializeRaidParse } from './export.ts';
import type { CombatParseDiagnostic, NormalizedRaidParse } from './types.ts';

const ABILITY = 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json';

function record(body: unknown, capturedAt = 10): CapturedResponseRecord {
  return {
    id: `scan:req-${capturedAt}`,
    scanId: 'scan',
    meta: { requestId: `req-${capturedAt}`, url: ABILITY, resourceType: 'xhr', capturedAt },
    body,
    categories: [],
  };
}

function context(): CombatParseContext {
  return {
    raidTechnicalId: 'diagnostic-raid',
    instanceId: 'diagnostic-instance',
    turn: 4,
    mainCharacterId: 'mc-tech',
    actorSlots: [
      { id: 'mc-tech', name: 'MC' },
      { id: 'front-a', name: 'Front A' },
      { id: 'front-b', name: 'Front B' },
      { id: 'front-c', name: 'Front C' },
    ],
  };
}

test('unrepresented inline scenario damage is retained only as sanitized diagnostic evidence', () => {
  const observation = parseVerifiedMultiraidObservation(record({ scenario: [{
    cmd: 'ability',
    pos: 3,
    name: 'Synthetic Passive Trigger',
    list: [{ value: 1_973_940 }],
    viewer_id: 'must-not-survive',
    request_url: 'https://example.invalid/?token=secret',
  }] }), context());

  assert.ok(observation);
  assert.equal(observation.actions.length, 0);
  assert.deepEqual(observation.parseDiagnostics, [{
    observedAt: 10,
    turn: 4,
    cmd: 'ability',
    name: 'Synthetic Passive Trigger',
    pos: 3,
    target: undefined,
    damage: 1_973_940,
  }]);

  const raid = mergeVerifiedMultiraidObservation(null, observation);
  assert.equal(raid.partyDamage, undefined);
  assert.deepEqual(raid.parseDiagnostics, observation.parseDiagnostics);
});

test('damage already represented by a parsed action does not create diagnostic noise', () => {
  const observation = parseVerifiedMultiraidObservation(record({ scenario: [
    { cmd: 'ability', pos: 3, name: 'Synthetic Skill' },
    { cmd: 'damage', to: 'boss', list: [{ value: 1_234 }] },
  ] }), context());

  assert.ok(observation);
  assert.equal(observation.actions.length, 1);
  assert.equal(observation.actions[0]?.hits[0]?.amount, 1_234);
  assert.equal(observation.parseDiagnostics, undefined);
});

test('raid export keeps only the diagnostic allowlist and strips extra account/request fields', () => {
  const diagnostic = {
    observedAt: 10,
    turn: 4,
    cmd: 'ability',
    name: 'Synthetic Passive Trigger',
    pos: 3,
    target: 'boss',
    damage: 1_973_940,
    raw: { viewer_id: 'secret-viewer' },
    requestUrl: 'https://example.invalid/?token=secret',
    accountId: 'secret-account',
  } as CombatParseDiagnostic & Record<string, unknown>;
  const raid: NormalizedRaidParse = {
    schemaVersion: 1,
    raidTechnicalId: 'diagnostic-raid',
    result: 'active',
    resultQuality: 'unknown',
    parserQuality: 'partial',
    damageQuality: 'unknown',
    characterDamage: [],
    stats: { quality: 'partial' },
    log: [],
    parseDiagnostics: [diagnostic],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: true, terminalObserved: false, parseGapObserved: true },
    lastObservedAt: 10,
  };

  const json = serializeRaidParse(raid);
  assert.doesNotMatch(json, /secret-viewer|token=secret|secret-account|requestUrl|accountId|viewer_id/);

  const parsed = parseRaidParseExport(json);
  assert.deepEqual(parsed.parseDiagnostics, [{
    observedAt: 10,
    turn: 4,
    cmd: 'ability',
    name: 'Synthetic Passive Trigger',
    pos: 3,
    target: 'boss',
    damage: 1_973_940,
  }]);
});