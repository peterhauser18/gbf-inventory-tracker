import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
const layoutsCss = readFileSync(new URL('./layouts.css', import.meta.url), 'utf8');
const liveUiCss = readFileSync(new URL('./live-ui-fixes.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const uiV2Css = readFileSync(new URL('./ui-v2.css', import.meta.url), 'utf8');
const sharedPresentation = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');
const stableDom = readFileSync(new URL('./live-dom-preservation.ts', import.meta.url), 'utf8');
const loadoutUi = readFileSync(new URL('./loadout-ui.ts', import.meta.url), 'utf8');
const loadoutPreservation = readFileSync(new URL('./loadout-dom-preservation.ts', import.meta.url), 'utf8');

test('Combat Cockpit is a bounded compact dashboard instead of stacked long sections', () => {
  assert.match(layouts, /class="cockpit-summary"/);
  assert.match(layouts, /renderCockpitTable\(view\)/);
  assert.doesNotMatch(
    /function renderCockpit[\s\S]*?function renderCockpitLoadout/.exec(layouts)?.[0] ?? '',
    /accordion\(view, 'party'|accordion\(view, 'summons'/,
  );
  assert.match(layoutsCss, /\.preset-combat-cockpit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(layoutsCss, /\.preset-combat-cockpit \.cockpit-table\s*\{[^}]*overflow:\s*auto/s);
  assert.match(uiV2Css, /\.active-combat-card \.preset-combat-cockpit\s*\{[^}]*height:\s*clamp\(620px,[^}]*max-height:\s*none[^}]*grid-template-rows:/s);
  assert.match(uiV2Css, /\.active-combat-card \.preset-combat-cockpit \.cockpit-loadout-panels\s*\{[^}]*height:\s*calc\(100% - 30px\)/s);
});

test('aggressive live refresh preserves loaded visuals and expanded state instead of flickering', () => {
  assert.match(ui, /detachStableCombatDom\(section\)/);
  assert.match(ui, /restoreStableCombatDom\(section, preservedStableDom\)/);
  assert.match(stableDom, /\.combat-boss-icon/);
  assert.match(stableDom, /img\[data-combat-image\]/);
  assert.match(stableDom, /\.cockpit-secondary-panel\[data-combat-collapse\]/);
  assert.match(stableDom, /\.cockpit-loadout-panel\[data-cockpit-loadout-panel\]/);
});

test('selected character details move inline directly below the selected combat row', () => {
  assert.match(sharedPresentation, /moveCockpitSelectedAnalysisInline\(root\)/);
  assert.match(sharedPresentation, /button\.cockpit-row\.selected/);
  assert.match(sharedPresentation, /selected\.insertAdjacentElement\('afterend', detail\)/);
  assert.match(sharedPresentation, /detail\.open = true/);
  assert.match(uiV2Css, /\.cockpit-inline-analysis \.analysis-character\s*\{\s*display:\s*none;/s);
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

test('cockpit summons label main and support without the old divider line', () => {
  assert.match(sharedPresentation, /addSummonRole\(cards\[0\], 'Main'\)/);
  assert.match(sharedPresentation, /addSummonRole\(cards\[5\], 'Support'\)/);
  assert.match(liveUiCss, /\.summon-card\.supporter-slot\s*\{[^}]*border-left:\s*0;/s);
  assert.match(uiV2Css, /\.preset-combat-cockpit \.summon-role-label\s*\{/);
});

test('compact Weapons view mirrors the game grid and keeps skill boosts visible', () => {
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-weapon-grid-shell\s*\{[^}]*grid-template-columns:\s*minmax\(118px,[^}]*minmax\(0, 2\.28fr\)/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-regular-weapons\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-additional-weapons\s*\{[^}]*grid-template-columns:\s*minmax\(118px,/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-additional-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-calculator\s*\{[^}]*display:\s*block/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-calculator-summary,[\s\S]*combat-enhancement-row\s*\{\s*display:\s*none;/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-skill-boosts\s*\{[^}]*display:\s*block/s);
});

test('Participants and Combat Log stay collapsed and open in bounded overlay panels', () => {
  assert.match(layouts, /compactAccordion\('participants', 'Participants'/);
  assert.match(layouts, /compactAccordion\('log', 'Combat Log'/);
  assert.match(layouts, /name="\$\{escapeAttribute\(group\)\}"/);
  assert.match(layoutsCss, /\.cockpit-secondary-panel\[open\] > div\s*\{[^}]*position:\s*absolute[^}]*max-height:[^}]*overflow:\s*auto/s);
});
