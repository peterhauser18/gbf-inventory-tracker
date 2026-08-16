import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./wiki-image-cleanup-ui.ts', import.meta.url), 'utf8');

test('Developer Wiki image cleanup stays local and only calls the shared cache cleanup seam', () => {
  assert.match(source, /import \{ clearWikiImageCache \} from '\.\/wiki-image-loader\.ts'/);
  assert.match(source, /data-section="developer"/);
  assert.match(source, /data\.clearWikiImageCache = 'true'/);
  assert.match(source, /await clearWikiImageCache\(\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.doesNotMatch(source, /game\.granbluefantasy\.jp/);
});
