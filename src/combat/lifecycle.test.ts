import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capturedRaidLocalId,
  combatRaidKey,
  isTerminalRaid,
  manualFinalizeRaid,
  observedFinalizeRaid,
  selectCombatContextKey,
} from './lifecycle.ts';
import type { NormalizedRaidParse } from './types.ts';

function raid(patch: Partial<NormalizedRaidParse> = {}): NormalizedRaidParse {
  return {
    schemaVersion: 1,
    raidTechnicalId: '305211',
    instanceId: 'raid-instance-a',
    result: 'active',
    resultQuality: 'unknown',
    parserQuality: 'partial',
    damageQuality: 'known',
    partyDamage: 123,
    characterDamage: [],
    stats: { quality: 'partial' },
    log: [],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: true, terminalObserved: false, parseGapObserved: false },
    observedStartedAt: 1_000,
    lastObservedAt: 2_000,
    ...patch,
  };
}

test('instance identity keeps two raids of the same quest independent', () => {
  assert.equal(combatRaidKey('305211', 'instance-a'), 'instance:instance-a');
  assert.equal(combatRaidKey('305211', 'instance-b'), 'instance:instance-b');
  assert.notEqual(combatRaidKey('305211', 'instance-a'), combatRaidKey('305211', 'instance-b'));
});

test('direct identity wins, then the observed tab instance, then the current raid', () => {
  const contexts = {
    'instance:instance-a': { instanceId: 'instance-a' },
    'instance:instance-b': { instanceId: 'instance-b' },
  };
  assert.equal(
    selectCombatContextKey(contexts, 'instance:instance-b', 'instance-a', 'instance-b'),
    'instance:instance-a',
  );
  assert.equal(
    selectCombatContextKey(contexts, 'instance:instance-b', undefined, 'instance-a'),
    'instance:instance-a',
  );
  assert.equal(selectCombatContextKey(contexts, 'instance:instance-b', undefined), 'instance:instance-b');
  assert.equal(selectCombatContextKey(contexts, 'instance:instance-b', 'unknown', 'instance-a'), undefined);
});

test('captured history identity remains stable across manual and observed finalization', () => {
  const active = raid();
  const manual = manualFinalizeRaid(active, 10_000);
  const observed = observedFinalizeRaid({
    ...active,
    result: 'victory',
    resultQuality: 'known',
    observedEndedAt: 11_000,
    durationMs: 10_000,
    coverage: { ...active.coverage, terminalObserved: true },
  });
  assert.equal(capturedRaidLocalId(manual), 'capture:raid-instance-a');
  assert.equal(capturedRaidLocalId(observed), 'capture:raid-instance-a');
});

test('manual finalization preserves observed damage but does not invent a terminal result', () => {
  const finalized = manualFinalizeRaid(raid(), 10_000);
  assert.equal(finalized.partyDamage, 123);
  assert.equal(finalized.result, 'unknown');
  assert.equal(finalized.resultQuality, 'unknown');
  assert.equal(finalized.coverage.terminalObserved, false);
  assert.equal(finalized.observedEndedAt, undefined);
  assert.equal(finalized.durationMs, undefined);
  assert.equal(finalized.finalization, 'manual');
  assert.equal(finalized.finalizedAt, 10_000);
});

test('observed terminal finalization retains terminal evidence', () => {
  const finalized = observedFinalizeRaid(raid({
    result: 'victory',
    resultQuality: 'known',
    observedEndedAt: 9_000,
    durationMs: 8_000,
    coverage: { startObserved: true, terminalObserved: true, parseGapObserved: false },
  }));
  assert.equal(finalized.result, 'victory');
  assert.equal(finalized.coverage.terminalObserved, true);
  assert.equal(finalized.finalization, 'observed');
  assert.equal(finalized.finalizedAt, 9_000);
});

test('known non-empty result rewards prove observed victory when the scenario win event was missed', () => {
  const completed = raid({
    drops: [{ itemId: '10:612', name: 'Immortal Fragment', quantity: 1, chest: '3' }],
    dropsQuality: 'known',
    lastObservedAt: 8_000,
  });
  assert.equal(isTerminalRaid(completed), true);

  const finalized = observedFinalizeRaid(completed);
  assert.equal(finalized.result, 'victory');
  assert.equal(finalized.resultQuality, 'known');
  assert.equal(finalized.coverage.terminalObserved, true);
  assert.equal(finalized.observedEndedAt, 8_000);
  assert.equal(finalized.durationMs, 7_000);
  assert.equal(finalized.finalization, 'observed');
  assert.equal(finalized.finalizedAt, 8_000);
});

test('manual finalize uses already-observed non-empty result rewards instead of downgrading them to unknown', () => {
  const completed = raid({
    drops: [{ itemId: '10:612', quantity: 1 }],
    dropsQuality: 'known',
    lastObservedAt: 8_000,
  });
  const finalized = manualFinalizeRaid(completed, 10_000);
  assert.equal(finalized.result, 'victory');
  assert.equal(finalized.resultQuality, 'known');
  assert.equal(finalized.finalization, 'observed');
  assert.equal(finalized.finalizedAt, 8_000);
});

test('known empty rewards alone do not invent victory', () => {
  const emptyRewards = raid({ drops: [], dropsQuality: 'known' });
  assert.equal(isTerminalRaid(emptyRewards), false);
  const manual = manualFinalizeRaid(emptyRewards, 10_000);
  assert.equal(manual.result, 'unknown');
  assert.equal(manual.finalization, 'manual');
});
