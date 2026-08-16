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
