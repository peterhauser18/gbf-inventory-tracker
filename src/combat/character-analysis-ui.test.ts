import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
const presentationFixes = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');

test('character detail exposes unclassified damage instead of hiding part of the total', () => {
  assert.match(layouts, /analysisMetric\('Unclassified', analysis\.breakdown\.other\)/);
});

test('SA DA TA retain observed count percentage and damage but render as one compact metric', () => {
  assert.match(layouts, /const attackModeSamples = \(analysis\.single\?\.count \?\? 0\) \+ \(analysis\.double\?\.count \?\? 0\) \+ \(analysis\.triple\?\.count \?\? 0\)/);
  assert.match(layouts, /attackMode\('SA', analysis\.single, attackModeSamples\)/);
  assert.match(layouts, /attackMode\('DA', analysis\.double, attackModeSamples\)/);
  assert.match(layouts, /attackMode\('TA', analysis\.triple, attackModeSamples\)/);
  assert.match(presentationFixes, /label\.textContent = 'SA \/ DA \/ TA'/);
  assert.match(presentationFixes, /primary\.textContent = summaries\.map\(\(entry\) => entry\.count\)\.join\(' \/ '\)/);
  assert.match(presentationFixes, /const percentages = summaries\.map\(\(entry\) => entry\.percent\)\.join\(' \/ '\)/);
  assert.match(presentationFixes, /entry\.damage/);
  assert.doesNotMatch(presentationFixes, /source-proven attacks/);
});

test('Ougi uses are folded into the Ougi damage metric instead of a second card', () => {
  assert.match(presentationFixes, /ougiLabel\.textContent = `Ougi \/ \$\{ougiCount\}`/);
  assert.match(presentationFixes, /ougiCard\?\.remove\(\)/);
});
