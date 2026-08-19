import assert from 'node:assert/strict';
import test from 'node:test';
import { enrichVerifiedOwnHonors } from './verified-combat-semantics.ts';
import type { VerifiedCombatObservation } from './multiraid.ts';

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
