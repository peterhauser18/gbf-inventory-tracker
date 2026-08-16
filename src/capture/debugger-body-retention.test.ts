import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');

test('debugger observation preserves response payloads without changing GBF request behavior', () => {
  assert.match(background, /Network\.enable/);
  assert.match(background, /maxTotalBufferSize:\s*NETWORK_MAX_TOTAL_BUFFER_SIZE/);
  assert.match(background, /maxResourceBufferSize:\s*NETWORK_MAX_RESOURCE_BUFFER_SIZE/);
  assert.match(background, /Network\.getResponseBody/);
  assert.match(background, /ResponseBodyUnavailableError/);

  assert.doesNotMatch(background, /Network\.replayXHR/);
  assert.doesNotMatch(background, /Network\.setCacheDisabled/);
  assert.doesNotMatch(background, /Fetch\.enable/);
  assert.doesNotMatch(background, /Network\.loadNetworkResource/);
});

test('body-read failures are surfaced with only the allowlisted URL path', () => {
  assert.match(background, /safeObservedPath\(url\)/);
  assert.match(background, /Allowlisted response skipped \(\$\{path\}\)/);
  assert.doesNotMatch(background, /error instanceof Error \? error\.message/);
});
