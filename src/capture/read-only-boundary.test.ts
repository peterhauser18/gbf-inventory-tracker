import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const srcRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
) as { content_scripts?: unknown[] };

function runtimeSources(directory: string): string[] {
  const sources: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...runtimeSources(path));
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    sources.push(readFileSync(path, 'utf8'));
  }
  return sources;
}

test('runtime does not instrument or generate GBF request primitives', () => {
  assert.equal(manifest.content_scripts, undefined);

  for (const source of runtimeSources(srcRoot)) {
    assert.doesNotMatch(source, /(?:window|host)\.fetch\s*=/);
    assert.doesNotMatch(source, /XMLHttpRequest\.prototype\.send\s*=/);
    assert.doesNotMatch(source, /prototype\.send\s*=\s*function/);
    assert.doesNotMatch(source, /Network\.(?:replayXHR|setRequestInterception|continueInterceptedRequest|setBlockedURLs)/);
    assert.doesNotMatch(source, /chrome\.scripting|executeScript\s*\(/);
    assert.doesNotMatch(source, /new\s+WebSocket\s*\(/);
    assert.doesNotMatch(source, /new\s+EventSource\s*\(/);
    assert.doesNotMatch(source, /sendBeacon\s*\(/);
    assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https:\/\/game\.granbluefantasy\.jp/i);
  }
});
