import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapturedResponseRecord } from '../capture/types.ts';
import {
  mergeVerifiedMultiraidObservation,
  parseVerifiedMultiraidObservation,
  type CombatParseContext,
  type VerifiedCombatObservation,
} from './multiraid.ts';
import { enrichVerifiedOwnHonors, enrichVerifiedScenarioSemantics } from './verified-combat-semantics.ts';

function observation(accountDisplayName: string, participants: Array<{ name: string; honors?: number }>): VerifiedCombatObservation {
  return {
    raidTechnicalId: '305211',
    observedAt: 1000,
    startObserved: false,
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops: [],
    dropsQuality: 'unknown',
    context: {
      raidTechnicalId: '305211',
      actorSlots: [],
      accountDisplayName,
      participants: participants.map((participant) => ({ ...participant })),
    },
  };
}

function memberRecord(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:members',
    scanId: 'scan',
    meta: {
      requestId: 'members',
      url: 'https://game.granbluefantasy.jp/rest/multiraid/multi_member_info',
      resourceType: 'xhr',
      capturedAt: 2000,
    },
    body,
    categories: [],
  };
}

test('verified member response persists exact own Honors when display-name ownership is unique', () => {
  const context: CombatParseContext = {
    raidTechnicalId: '305211',
    instanceId: 'raid-instance',
    actorSlots: [],
    accountDisplayName: 'Skyfarer',
  };
  const record = memberRecord({
    multi_member_info: [
      { nickname: 'Skyfarer', level: 375 },
      { nickname: 'Other', level: 350 },
    ],
    mvp_info: [
      { nickname: 'Skyfarer', rank: 1, point: '12345' },
      { nickname: 'Other', rank: 2, point: '9000' },
    ],
  });
  const parsed = parseVerifiedMultiraidObservation(record, context);
  assert.ok(parsed);
  enrichVerifiedScenarioSemantics(record.body, parsed);
  const raid = mergeVerifiedMultiraidObservation(null, parsed);
  assert.equal(raid.participants?.honors, 12345);
});

test('unique proven account participant Honors are copied into normalized participant state', () => {
  const value = observation('Skyfarer', [
    { name: 'Other', honors: 500 },
    { name: 'Skyfarer', honors: 12345 },
  ]);
  enrichVerifiedOwnHonors(value);
  assert.equal(value.participants?.honors, 12345);
  assert.notEqual(value.participants?.quality, 'unknown');
});

test('ambiguous participant identity does not manufacture own Honors', () => {
  const value = observation('Skyfarer', [
    { name: 'Skyfarer', honors: 12345 },
    { name: 'Skyfarer', honors: 54321 },
  ]);
  enrichVerifiedOwnHonors(value);
  assert.equal(value.participants?.honors, undefined);
});

test('technical MC resource labels are not accepted as account identity for Honors', () => {
  const value = observation('190501_sp_1_01', [{ name: '190501_sp_1_01', honors: 12345 }]);
  enrichVerifiedOwnHonors(value);
  assert.equal(value.participants?.honors, undefined);
});
