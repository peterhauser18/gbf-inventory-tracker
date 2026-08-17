import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ux = readFileSync(new URL('./interaction-ux.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('combat installs shared interaction UX with default-collapsed log and skills', () => {
  assert.match(ui, /installCombatRaidInteractionUx\(app\)/);
  assert.match(ux, /summary\?\.textContent\?\.trim\(\) !== 'Combat Log'/);
  assert.match(ux, /if \(!state\.has\(key\)\) state\.set\(key, false\)/);
  assert.match(ux, /details\.className = 'combat-accordion combat-ux-skills'/);
  assert.match(ux, /details\.open = skillOpenByKey\.get\(key\) \?\? false/);
});

test('clicking an already selected combat character suppresses and restores shared details', () => {
  assert.match(ux, /partyButton\.classList\.contains\('selected'\)/);
  assert.match(ux, /event\.stopImmediatePropagation\(\)/);
  assert.match(ux, /suppressedCombatActorId = actorId/);
  assert.match(ux, /suppressedCombatActorId === actorId/);
  assert.match(ux, /revealCombatDetails\(section, actorId\)/);
});

test('raid history removes notes, starts drops collapsed, and reuses cockpit character detail rendering', () => {
  assert.match(ux, /querySelectorAll<HTMLElement>\('\.raid-note'\)/);
  assert.match(ux, /raidDropOpenById/);
  assert.match(ux, /dataset\.raidCharacterActorId/);
  assert.match(ux, /selectedRaidActorById/);
  assert.match(ux, /renderCombatLayout\('combat-cockpit', \{/);
  assert.match(ux, /querySelector<HTMLElement>\('\.cockpit-inline-detail'\)/);
  assert.doesNotMatch(ux, /fetch\(|XMLHttpRequest|webRequest/);
});
