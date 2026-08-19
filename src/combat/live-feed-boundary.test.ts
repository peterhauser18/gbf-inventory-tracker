import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const observer = readFileSync(new URL('./live-feed-observer.ts', import.meta.url), 'utf8');

test('Live Battle Feed integration is debugger receive-only', () => {
  assert.match(observer, /Network\.webSocketCreated/);
  assert.match(observer, /Network\.webSocketFrameReceived/);
  assert.match(observer, /Network\.webSocketClosed/);
  assert.match(observer, /ingestCapturedCombatRecord/);
  assert.doesNotMatch(observer, /Network\.webSocketFrameSent/);
  assert.match(observer, /Network\.getResponseBody/);
  assert.doesNotMatch(observer, /Network\.(?:webSocketFrameSent|replayXHR|setRequestInterception|continueInterceptedRequest)/);
  assert.doesNotMatch(observer, /new\s+WebSocket|WebSocket\s*\(/);
  assert.doesNotMatch(observer, /fetch\s*\(|XMLHttpRequest/);
});
