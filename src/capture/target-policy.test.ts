import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combatTargetAfterResult,
  isTerminalResult,
  shouldRetargetObservation,
} from './target-policy.ts';

test('inventory observation follows a different active GBF tab when no fight is locked', () => {
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 20), true);
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 10), false);
  assert.equal(shouldRetargetObservation({ active: false, tabId: 10 }, 20), false);
});

test('active combat keeps observation on the locked fight tab', () => {
  const state = { active: true, tabId: 10, combatTabId: 10 };
  assert.equal(shouldRetargetObservation(state, 20), false);
  assert.equal(shouldRetargetObservation(state, 10), false);
});

test('combat lock follows normalized active and terminal results only for the source fight tab', () => {
  assert.equal(combatTargetAfterResult(undefined, 10, 'active'), 10);
  assert.equal(combatTargetAfterResult(10, 10, 'unknown'), 10);
  assert.equal(combatTargetAfterResult(10, 20, 'victory'), 10);
  assert.equal(combatTargetAfterResult(10, 10, 'victory'), undefined);
  assert.equal(combatTargetAfterResult(10, 10, 'failure'), undefined);
  assert.equal(combatTargetAfterResult(10, 10, 'left'), undefined);
});

test('terminal result classification excludes active and unknown parses', () => {
  assert.equal(isTerminalResult('victory'), true);
  assert.equal(isTerminalResult('failure'), true);
  assert.equal(isTerminalResult('left'), true);
  assert.equal(isTerminalResult('active'), false);
  assert.equal(isTerminalResult('unknown'), false);
});
