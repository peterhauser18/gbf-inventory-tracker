import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRaidParseExport, serializeRaidParse } from './export.ts';
import type { NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

test('raid parse export round-trips normalized facts and excludes local/user/secret/internal identity fields', () => {
  const record: RaidHistoryRecord & Record<string, unknown> = {
    schemaVersion: 1, raidTechnicalId: 'raid-1', instanceId: 'instance-secret', raidName: 'Test Raid', result: 'victory', resultQuality: 'known',
    parserQuality: 'partial', damageQuality: 'partial', partyDamage: 100, characterDamage: [], stats: { quality: 'partial' },
    log: [], drops: [{ itemId: 'item-1', quantity: 1, chest: 'blue' }], dropsQuality: 'known',
    coverage: { startObserved: false, terminalObserved: true, parseGapObserved: false }, lastObservedAt: 10, observedEndedAt: 10,
    finalization: 'observed', finalizedAt: 10,
    localId: 'local-history-id', source: 'captured', favorite: true, note: 'private note',
    cookie: 'secret-cookie', authorization: 'secret-auth', requestUrl: 'https://example.invalid/?token=secret', accountId: '123',
  };
  const json = serializeRaidParse(record);
  assert.doesNotMatch(json, /local-history-id|private note|secret-cookie|secret-auth|token=secret|accountId|instance-secret/i);
  const parsed = parseRaidParseExport(json);
  assert.equal(parsed.raidTechnicalId, 'raid-1');
  assert.equal(parsed.instanceId, undefined);
  assert.equal(parsed.finalization, 'observed');
  assert.equal(parsed.finalizedAt, 10);
  assert.equal(parsed.drops[0]?.itemId, 'item-1');
});

test('active raid state is exportable without pretending a terminal result was observed', () => {
  const active: NormalizedRaidParse = {
    schemaVersion: 1,
    raidTechnicalId: 'raid-active',
    instanceId: 'internal-instance',
    raidName: 'Active Raid',
    result: 'active',
    resultQuality: 'unknown',
    parserQuality: 'partial',
    damageQuality: 'known',
    partyDamage: 42,
    characterDamage: [],
    stats: { quality: 'partial' },
    log: [],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: true, terminalObserved: false, parseGapObserved: false },
    lastObservedAt: 50,
  };
  const parsed = parseRaidParseExport(serializeRaidParse(active));
  assert.equal(parsed.result, 'active');
  assert.equal(parsed.partyDamage, 42);
  assert.equal(parsed.coverage.terminalObserved, false);
  assert.equal(parsed.instanceId, undefined);
});
