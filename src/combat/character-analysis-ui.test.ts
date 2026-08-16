import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');

test('character detail exposes unclassified damage instead of hiding part of the total', () => {
  assert.match(layouts, /analysisMetric\('Unclassified', analysis\.breakdown\.other\)/);
});

test('SA DA TA show count and percentage of source-proven attack-mode samples', () => {
  assert.match(layouts, /const attackModeSamples = \(analysis\.single\?\.count \?\? 0\) \+ \(analysis\.double\?\.count \?\? 0\) \+ \(analysis\.triple\?\.count \?\? 0\)/);
  assert.match(layouts, /attackMode\('SA', analysis\.single, attackModeSamples\)/);
  assert.match(layouts, /attackMode\('DA', analysis\.double, attackModeSamples\)/);
  assert.match(layouts, /attackMode\('TA', analysis\.triple, attackModeSamples\)/);
  assert.match(layouts, /const count = value\?\.count \?\? 0/);
  assert.match(layouts, /formatPercent\(count \/ denominator\)/);
  assert.match(layouts, /denominator <= 0/);
  assert.match(layouts, /source-proven attacks/);
});
