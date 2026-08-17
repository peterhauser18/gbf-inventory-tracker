import assert from 'node:assert/strict';
import test from 'node:test';
import { isTerminalResult, shouldRetargetObservation } from './target-policy.ts';

test('observation follows a different active GBF tab or window while staying passive', () => {
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 20), true);
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 10), false);
  assert.equal(shouldRetargetObservation({ active: true }, 20), true);
  assert.equal(shouldRetargetObservation({ active: false, tabId: 10 }, 20), false);
});

test('terminal result classification excludes active and unknown parses', () => {
  assert.equal(isTerminalResult('victory'), true);
  assert.equal(isTerminalResult('failure'), true);
  assert.equal(isTerminalResult('left'), true);
  assert.equal(isTerminalResult('active'), false);
  assert.equal(isTerminalResult('unknown'), false);
});
