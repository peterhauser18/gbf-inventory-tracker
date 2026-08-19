import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
const layoutsCss = readFileSync(new URL('./layouts.css', import.meta.url), 'utf8');
const loadoutUi = readFileSync(new URL('./loadout-ui.ts', import.meta.url), 'utf8');
const loadoutPreservation = readFileSync(new URL('./loadout-dom-preservation.ts', import.meta.url), 'utf8');

test('Combat Cockpit is a bounded compact dashboard instead of stacked long sections', () => {
  assert.match(layouts, /class="cockpit-summary"/);
  assert.match(layouts, /renderCockpitTable\(view\)/);
  assert.doesNotMatch(
    /function renderCockpit[\s\S]*?function renderCockpitLoadout/.exec(layouts)?.[0] ?? '',
    /accordion\(view, 'party'|accordion\(view, 'summons'/,
  );
  assert.match(layoutsCss, /\.preset-combat-cockpit\s*\{[^}]*max-height:[^}]*overflow:\s*hidden/s);
  assert.match(layoutsCss, /\.preset-combat-cockpit \.cockpit-table\s*\{[^}]*overflow:\s*auto/s);
});

test('Combat Cockpit shares one lower slot between characters, summons, and weapons', () => {
  for (const view of ['characters', 'summons', 'weapons']) {
    assert.match(layouts, new RegExp(`data-cockpit-loadout-panel="${view}"`));
  }
  assert.match(layouts, /type="radio"[\s\S]*Characters[\s\S]*Summons[\s\S]*Weapons/);
  assert.match(layoutsCss, /cockpit-tab-input:nth-of-type\(1\):checked/);
  assert.match(layoutsCss, /cockpit-tab-input:nth-of-type\(2\):checked/);
  assert.match(layoutsCss, /cockpit-tab-input:nth-of-type\(3\):checked/);
  assert.match(loadoutUi, /querySelector<HTMLElement>\('\[data-cockpit-weapon-slot\]'\)/);
  assert.match(loadoutUi, /cockpitWeaponSlot\.replaceChildren\(next\)/);
  assert.match(loadoutPreservation, /cockpitWeaponSlot\.replaceChildren\(node\)/);
  assert.match(loadoutPreservation, /rememberCockpitViews\(root\)/);
  assert.match(loadoutPreservation, /restoreCockpitViews\(root\)/);
  assert.match(layouts, /Weapon Grid — Unknown\. Waiting for a matching passive Party deck observation\./);
});

test('Participants and Combat Log stay collapsed and open in bounded overlay panels', () => {
  assert.match(layouts, /compactAccordion\('participants', 'Participants'/);
  assert.match(layouts, /compactAccordion\('log', 'Combat Log'/);
  assert.match(layouts, /name="\$\{escapeAttribute\(group\)\}"/);
  assert.match(layoutsCss, /\.cockpit-secondary-panel\[open\] > div\s*\{[^}]*position:\s*absolute[^}]*max-height:[^}]*overflow:\s*auto/s);
});
