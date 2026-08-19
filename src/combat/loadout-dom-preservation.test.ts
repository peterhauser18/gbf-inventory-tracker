import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('combat rerenders preserve the loaded weapon grid node synchronously', () => {
  assert.match(source, /const preservedLoadouts = detachCombatLoadouts\(section\);/);
  assert.match(source, /section\.innerHTML = markup;/);
  assert.match(source, /restoreCombatLoadouts\(section, preservedLoadouts\);/);
  assert.match(source, /decorateLoadouts\(section\);/);

  const detachAt = source.indexOf('const preservedLoadouts = detachCombatLoadouts(section);');
  const replaceAt = source.indexOf('section.innerHTML = markup;');
  const restoreAt = source.indexOf('restoreCombatLoadouts(section, preservedLoadouts);');
  const decorateAt = source.lastIndexOf('decorateLoadouts(section);');

  assert.ok(detachAt >= 0 && detachAt < replaceAt);
  assert.ok(replaceAt < restoreAt);
  assert.ok(restoreAt < decorateAt);
});
