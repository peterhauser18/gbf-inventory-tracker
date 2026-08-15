import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const parser = readFileSync(new URL('./parser.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8');

test('combat ingestion remains attached only to passive response-body capture', () => {
  assert.match(background, /Network\.getResponseBody/);
  assert.match(background, /ingestCapturedCombatRecord/);
  for (const source of [background, parser, storage, dashboard]) {
    assert.doesNotMatch(source, /Network\.replayXHR|Network\.setRequestInterception|Network\.continueInterceptedRequest/);
    assert.doesNotMatch(source, /XMLHttpRequest|chrome\.scripting|executeScript\s*\(/);
    assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https:\/\/game\.granbluefantasy\.jp/i);
  }
});
