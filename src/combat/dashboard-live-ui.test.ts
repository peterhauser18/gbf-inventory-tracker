import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8');

test('live combat UI is collapsible and does not expose quality chips', () => {
  assert.match(dashboard, /data-combat-collapse/);
  assert.match(dashboard, /<details class=\"combat-panel\"/);
  assert.doesNotMatch(dashboard, /qualityChip\(/);
  assert.doesNotMatch(dashboard, /class=\"quality /);
});

test('live combat UI uses contribution as honors fallback and puts participants below damage', () => {
  assert.match(dashboard, /participant\?\.honors \?\? participant\?\.contribution/);
  const damage = dashboard.indexOf("this.combatPanel('damage'");
  const participants = dashboard.indexOf("this.combatPanel('participants'");
  assert.ok(damage >= 0 && participants > damage);
  assert.match(dashboard, /participant-table/);
});

test('damage rows render directly observed actor HP when available', () => {
  assert.match(dashboard, /formatActorHp/);
  assert.match(dashboard, /combat-character-hp/);
  assert.match(dashboard, /actor\.hp \/ actor\.maxHp \* 100/);
});
