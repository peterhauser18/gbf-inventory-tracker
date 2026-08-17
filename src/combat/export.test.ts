import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRaidParseExport, serializeRaidParse } from './export.ts';
import type { RaidHistoryRecord } from './types.ts';

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
