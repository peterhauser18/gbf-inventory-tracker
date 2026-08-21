import assert from 'node:assert/strict';
import test from 'node:test';
import { isTerminalResult, shouldRetargetObservation } from './target-policy.ts';

test('observation adds a different active GBF tab once and keeps already observed tabs attached', () => {
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10, tabIds: [10] }, 20), true);
  assert.equal(shouldRetargetObservation({ active: true, tabId: 20, tabIds: [10, 20] }, 10), false);
  assert.equal(shouldRetargetObservation({ active: true, tabId: 20, tabIds: [10, 20] }, 20), false);
  assert.equal(shouldRetargetObservation({ active: true }, 20), true);
  assert.equal(shouldRetargetObservation({ active: false, tabId: 10, tabIds: [10] }, 20), false);
});

test('legacy single-tab state still avoids reattaching the same target', () => {
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 10), false);
  assert.equal(shouldRetargetObservation({ active: true, tabId: 10 }, 20), true);
});

test('terminal result classification excludes active and unknown parses', () => {
  assert.equal(isTerminalResult('victory'), true);
  assert.equal(isTerminalResult('failure'), true);
  assert.equal(isTerminalResult('left'), true);
  assert.equal(isTerminalResult('active'), false);
  assert.equal(isTerminalResult('unknown'), false);
});
