import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const parser = readFileSync(new URL('./parser.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8');

test('combat ingestion remains attached only to debugger response-body capture', () => {
  assert.match(background, /Network\.getResponseBody/);
  assert.match(background, /ingestCapturedCombatRecord/);
  assert.match(background, /classifyObservedResponseUrl/);
  assert.match(background, /shouldReadObservedResponse/);
  for (const source of [background, parser, storage, dashboard]) {
    assert.doesNotMatch(source, /Network\.replayXHR|Network\.setRequestInterception|Network\.continueInterceptedRequest/);
    assert.doesNotMatch(source, /XMLHttpRequest|chrome\.scripting|executeScript\s*\(/);
    assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https:\/\/game\.granbluefantasy\.jp/i);
  }
});

test('recognized combat responses persist only normalized combat facts', () => {
  assert.match(
    background,
    /const route = classifyObservedResponseUrl\(record\.meta\.url\);\s*if \(route === 'combat'\) \{\s*await ingestCapturedCombatRecord\(record\);\s*return;\s*\}/s,
  );
  assert.doesNotMatch(background, /route === 'combat'[\s\S]{0,240}saveCapturedResponse/);
});

test('raid instance correlation is session-only and strips non-public actor names', () => {
  assert.match(storage, /const CONTEXT_KEY = 'gbfit:combat-context'/);
  assert.match(storage, /chrome\.storage\.session\.get\(CONTEXT_KEY\)/);
  assert.match(storage, /chrome\.storage\.session\.set\(\{ \[CONTEXT_KEY\]: context \}\)/);
  assert.match(background, /clearCombatParseContext/);
  assert.doesNotMatch(storage, /interface LatestRow[^\n]*context/);
  assert.doesNotMatch(storage, /objectStore\(LATEST_STORE\)\.put\(\{ key: LATEST_KEY, parse, context/);
  assert.match(storage, /\^30\[234\]\\d\{7\}\$/);
});
