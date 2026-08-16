import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const entry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./planner-reached.css', import.meta.url), 'utf8');

test('dashboard entry groups only reached Eternal stages under the requested collapsed label', () => {
  assert.match(entry, /kind !== 'ETERNAL'/);
  assert.match(entry, /groupPlannerSteps\('eternal', stepDescriptors\)/);
  assert.match(entry, /Already uncapped to \$\{groups\.highestReached\.targetDisplay\}/);
  assert.match(entry, /stepsContainer\.hidden = groups\.visible\.length === 0/);
  assert.match(styles, /\.planner-reached-summary/);
});

test('Eternal and Evoker details replace the redundant facts box with compact header facts', () => {
  assert.match(entry, /kind !== 'ETERNAL' && kind !== 'EVOKER'/);
  assert.match(entry, /=== 'Observed facts'/);
  assert.match(entry, /level \? `Lv \$\{level\}`/);
  assert.match(entry, /uncap \? `Uncap \$\{uncap\}★`/);
  assert.match(entry, /awakening \? `Awakening \$\{awakening\}`/);
  assert.match(entry, /factsSection\.remove\(\)/);
});

test('planner polish preserves current dashboard live-refresh and clean-install reload behavior', () => {
  assert.match(entry, /if \(!section \|\| !sectionUsesAccountEvidence\(section, changed\)\) return/);
  assert.match(entry, /scheduleReload\(undefined, 0\)/);
  assert.match(entry, /function scheduleReload\(section: string \| undefined, delay: number\)/);
});

test('reopening or switching details starts the reached Eternal group collapsed again', () => {
  assert.match(entry, /\[data-detail\], \[data-close-detail\], \.nav-item\[data-section\]/);
  assert.match(entry, /openReachedEternal = undefined/);
});
