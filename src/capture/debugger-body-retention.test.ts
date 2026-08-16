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

test('body-read failures surface only a sanitized allowlisted path and bounded reason', () => {
  assert.match(background, /const path = safeObservedPath\(url\)/);
  assert.match(background, /Allowlisted response skipped \(\$\{path\}\): \$\{reason\}/);
  assert.match(background, /Edge did not expose the completed response body after three debugger reads\./);
  assert.match(background, /Local processing of the observed response failed\./);
});
