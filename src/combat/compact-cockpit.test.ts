import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const layouts = readFileSync(new URL('./layouts.ts', import.meta.url), 'utf8');
const layoutsCss = readFileSync(new URL('./layouts.css', import.meta.url), 'utf8');
const liveUiCss = readFileSync(new URL('./live-ui-fixes.css', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const uiV2Css = readFileSync(new URL('./ui-v2.css', import.meta.url), 'utf8');
const runtimePolishCss = readFileSync(new URL('./cockpit-weapon-runtime-polish.css', import.meta.url), 'utf8');
const dashboardMultiActive = readFileSync(new URL('./dashboard-multi-active.ts', import.meta.url), 'utf8');
const dashboardV2 = readFileSync(new URL('./dashboard-v2.ts', import.meta.url), 'utf8');
const loadoutFillCss = readFileSync(new URL('./cockpit-loadout-fill.css', import.meta.url), 'utf8');
const sharedPresentation = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');
const stableDom = readFileSync(new URL('./live-dom-preservation.ts', import.meta.url), 'utf8');
const loadoutUi = readFileSync(new URL('./loadout-ui.ts', import.meta.url), 'utf8');
const loadoutPreservation = readFileSync(new URL('./loadout-dom-preservation.ts', import.meta.url), 'utf8');
const raidHistoryCompact = readFileSync(new URL('./raid-history-compact.ts', import.meta.url), 'utf8');
const raidHistoryCss = readFileSync(new URL('./raid-history-compact.css', import.meta.url), 'utf8');
const attackModes = readFileSync(new URL('./cockpit-attack-modes.ts', import.meta.url), 'utf8');
const attackModesCss = readFileSync(new URL('./cockpit-attack-modes.css', import.meta.url), 'utf8');
const finalPolish = readFileSync(new URL('./cockpit-final-polish.ts', import.meta.url), 'utf8');
const finalPolishCss = readFileSync(new URL('./cockpit-final-polish.css', import.meta.url), 'utf8');

test('Combat Cockpit is a bounded compact dashboard instead of stacked long sections', () => {
  assert.match(layouts, /class="cockpit-summary"/);
  assert.match(layouts, /renderCockpitTable\(view\)/);
  assert.doesNotMatch(
    /function renderCockpit[\s\S]*?function renderCockpitLoadout/.exec(layouts)?.[0] ?? '',
    /accordion\(view, 'party'|accordion\(view, 'summons'/,
  );
  assert.match(layoutsCss, /\.preset-combat-cockpit\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(layoutsCss, /\.preset-combat-cockpit \.cockpit-table\s*\{[^}]*overflow:\s*auto/s);
  assert.match(runtimePolishCss, /\.active-combat-card \.preset-combat-cockpit\s*\{[^}]*height:\s*clamp\(620px,\s*calc\(100dvh - 165px\),\s*920px\)/s);
  assert.match(uiV2Css, /\.active-combat-card \.preset-combat-cockpit \.cockpit-loadout-panels\s*\{[^}]*height:\s*calc\(100% - 30px\)/s);
});

test('standalone Combat omits redundant page and active-raid chrome', () => {
  assert.match(ui, /const header = selected === 'combat'\s*\? ''/s);
  assert.doesNotMatch(ui, /Live read-only raid analytics from already-received supported combat responses\./);
  assert.doesNotMatch(ui, /<p class="eyebrow">COMBAT<\/p><h2>Combat<\/h2>/);
  assert.doesNotMatch(dashboardMultiActive, /active-combat-card-label/);
  assert.doesNotMatch(dashboardMultiActive, /Local parser state only\. Manual finalization sends no GBF request\./);
  assert.match(dashboardMultiActive, /active-combat-actions active-combat-actions-only/);
});

test('aggressive live refresh preserves loaded visuals and expanded state instead of flickering', () => {
  assert.match(ui, /detachStableCombatDom\(section\)/);
  assert.match(ui, /restoreStableCombatDom\(section, preservedStableDom\)/);
  assert.match(stableDom, /\.combat-boss-icon/);
  assert.match(stableDom, /img\[data-combat-image\]/);
  assert.match(stableDom, /\.cockpit-secondary-panel\[data-combat-collapse\]/);
  assert.match(stableDom, /\.cockpit-loadout-panel\[data-cockpit-loadout-panel\]/);
});

test('known weapon grids survive transient unknown refreshes while Character and Summon cards stay top-aligned', () => {
  assert.match(loadoutUi, /let latestDecorationRun = 0/);
  assert.match(loadoutUi, /run !== latestDecorationRun \|\| !root\.isConnected/);
  assert.match(loadoutUi, /shouldPreserveCurrentLoadout\(current, target\.loadout\)/);
  assert.match(loadoutUi, /qualityRank\(currentQuality\) > qualityRank\(incomingQuality\)/);
  assert.match(loadoutUi, /next\.dataset\.loadoutGridQuality = target\.loadout\?\.weaponGridQuality \?\? 'unknown'/);
  assert.match(ui, /import '\.\/cockpit-loadout-fill\.css'/);
  assert.match(loadoutFillCss, /\.party-cards-compact,[\s\S]*\.summon-strip\s*\{[^}]*height:\s*auto/s);
  assert.match(loadoutFillCss, /\.party-card-visual\s*\{[^}]*aspect-ratio:\s*16 \/ 9/s);
  assert.match(loadoutFillCss, /\.summon-card \.combat-image\s*\{[^}]*aspect-ratio:\s*1 \/ 2/s);
  assert.match(finalPolishCss, /\.preset-combat-cockpit \.party-cards-compact\s*\{[^}]*height:\s*auto !important/s);
  assert.match(finalPolishCss, /\.preset-combat-cockpit \.cockpit-summons-panel \.summon-strip\s*\{[^}]*height:\s*auto !important/s);
});

test('weapon grid does not rebuild for timestamp-only refreshes and preserves scroll on real replacements', () => {
  const fingerprintFunction = /function loadoutFingerprint[\s\S]*?function rememberLoadoutScroll/.exec(loadoutUi)?.[0] ?? '';
  assert.doesNotMatch(fingerprintFunction, /updatedAt|observedAt/);
  assert.match(fingerprintFunction, /weapons:\s*loadout\.weapons\.map/);
  assert.match(fingerprintFunction, /calculator:/);
  assert.match(loadoutUi, /rememberLoadoutScroll\(target\.mount\)/);
  assert.match(loadoutUi, /restoreLoadoutScroll\(scroll\)/);
  assert.match(loadoutUi, /requestAnimationFrame\(\(\) =>/);
});

test('character drill-down is removed and SA DA TA counts with percentages are added while Echo stays visible', () => {
  assert.match(sharedPresentation, /removeCockpitSelectedAnalysis\(root\)/);
  assert.match(sharedPresentation, /\.cockpit-selected-analysis/);
  assert.match(attackModes, /for \(const label of \['SA', 'DA', 'TA'\]\)/);
  assert.match(attackModes, /cell\.textContent\?\.trim\(\) === 'Supp\.'/);
  assert.doesNotMatch(attackModes, /=== 'Echo'/);
  assert.match(attackModes, /count \/ total \* 100/);
  assert.match(attackModes, /`\$\{count\} \(\$\{formatPercent\(percent\)\}%\)`/);
  assert.match(attackModesCss, /repeat\(9, minmax\(48px,/);
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

test('cockpit summons label main and support inside the image without the old divider line', () => {
  assert.match(sharedPresentation, /addSummonRole\(cards\[0\], 'Main'\)/);
  assert.match(sharedPresentation, /addSummonRole\(cards\[5\], 'Support'\)/);
  assert.match(sharedPresentation, /const image = card\.querySelector<HTMLElement>\('\.combat-image'\)/);
  assert.match(sharedPresentation, /image\.append\(label\)/);
  assert.match(liveUiCss, /\.summon-card\.supporter-slot\s*\{[^}]*border-left:\s*0;/s);
  assert.match(finalPolishCss, /summon-card \.combat-image > \.summon-role-label\s*\{[^}]*position:\s*absolute !important/s);
});

test('compact Weapons view mirrors the game grid without per-weapon skill text and keeps boosts collapsed by default', () => {
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-weapon-grid-shell\s*\{[^}]*grid-template-columns:\s*minmax\(118px,[^}]*minmax\(0, 2\.28fr\)/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-regular-weapons\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-additional-weapons\s*\{[^}]*grid-template-columns:\s*minmax\(118px,/s);
  assert.match(uiV2Css, /cockpit-weapon-slot \.combat-additional-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.doesNotMatch(loadoutUi, /combat-weapon-skills|data-loadout-weapon-skills|loadWikiGameplayFamily/);
  assert.match(loadoutUi, /<details class="combat-skill-boosts"/);
  assert.match(loadoutUi, /skillBoostsOpen \? ' open' : ''/);
  assert.match(runtimePolishCss, /\.combat-skill-boosts > summary/);
  assert.match(runtimePolishCss, /\.combat-skill-boosts\[open\] > summary::after/);
});

test('live roster keeps all six observed original actors and makes deaths/backline explicit inside portraits', () => {
  assert.match(finalPolish, /const roster = \(context\.actors \?\? \[\]\)/);
  assert.match(finalPolish, /\.slice\(0, 6\)/);
  assert.match(finalPolish, /normalizeCockpitTable\(card, key, roster/);
  assert.match(finalPolish, /normalizeCockpitPartyCards\(card, key, roster/);
  assert.match(finalPolish, /actor\.alive === false \|\| actor\.hp === 0/);
  assert.match(finalPolish, /`Dead · Backline \$\{index - 3\}`/);
  assert.match(finalPolish, /`Backline \$\{index - 3\}`/);
  assert.doesNotMatch(finalPolish, /Retained from verified party history/);
  assert.match(finalPolish, /movePartyOverlaysIntoVisual\(partyCard\)/);
  assert.match(finalPolishCss, /\.cockpit-row\.dead[\s\S]*opacity:/s);
  assert.match(finalPolishCss, /\.cockpit-row\.dead \.combat-image img,[\s\S]*filter:\s*grayscale\(1\)/s);
  assert.match(finalPolishCss, /button\.cockpit-row\s*\{[^}]*flex:\s*1 1 0/s);
  assert.match(finalPolishCss, /party-cards-compact \.state-tag\s*\{[^}]*position:\s*absolute !important/s);
});

test('MC and characters prefer locally observed battle portrait bytes without a new image lookup', () => {
  assert.match(finalPolish, /readObservedActorImageBlob/);
  assert.match(finalPolish, /const ids = \[actor\.id, actorVisualImageId\(actor\)\]/);
  assert.match(finalPolish, /URL\.createObjectURL\(blob\)/);
  assert.doesNotMatch(finalPolish, /gbf\.wiki\/api\.php|pageimages|fetch\(/);
});

test('Raid History uses compact five-record pages with navigation above the raid list under Search', () => {
  assert.match(ui, /const layout: CombatLayoutPreset = 'combat-cockpit'/);
  assert.doesNotMatch(ui, /combat-layout-select|COMBAT_LAYOUT_PRESETS|loadLayoutPreference/);
  assert.match(ui, /class="content-header raids-compact-header"/);
  assert.doesNotMatch(ui, /<h2>Raids<\/h2>/);
  assert.match(dashboardV2, /const RAIDS_PER_PAGE = 5/);
  assert.match(dashboardV2, /const visibleRaids = raids\.slice\(start, start \+ RAIDS_PER_PAGE\)/);
  assert.match(dashboardV2, /this\.renderRaidPagination\(totalPages\)/);
  assert.match(dashboardV2, /visibleRaids\.map\(\(raid\) => this\.renderRaid\(raid, layout\)\)/);
  assert.doesNotMatch(raidHistoryCompact, /card\.hidden|renderPagination/);
  assert.match(raidHistoryCompact, /toolbar\.classList\.add\('raid-toolbar-bottom'\)/);
  assert.match(raidHistoryCompact, /if \(toolbar !== root\.lastElementChild\) root\.append\(toolbar\)/);
});

test('live and historical cockpit show Party Damage Previous Current Honors and Participants together', () => {
  assert.match(layouts, /liveStat\('Honors', honors\)/);
  assert.match(layouts, /liveStat\('Participants', participants\)/);
  assert.match(finalPolish, /label === 'Average \/ Turn'/);
  assert.match(finalPolishCss, /\.preset-combat-cockpit \.combat-live-stats\s*\{[^}]*repeat\(5,/s);
  assert.match(finalPolishCss, /\.preset-combat-cockpit \.live-stat\s*\{[^}]*display:\s*grid !important/s);
  assert.doesNotMatch(raidHistoryCss, /live-stat:nth-child\(4\)[\s\S]*display:\s*none/s);
});

test('Raid History visually flattens the duplicate wrapper and retains the shared Combat Cockpit plus Drops', () => {
  assert.match(raidHistoryCompact, /flattenRaidCards\(root\)/);
  assert.match(raidHistoryCompact, /raid-history-tools-only/);
  assert.match(raidHistoryCompact, /raid-combat-flat/);
  assert.match(raidHistoryCompact, /combat\.open = true/);
  assert.match(finalPolishCss, /\.raid-section\.raid-combat-flat > summary\s*\{[^}]*display:\s*none/s);
  assert.match(finalPolishCss, /\.raid-card \.preset-combat-cockpit\s*\{[^}]*height:\s*clamp\(620px/s);
});

test('Participants and Combat Log stay collapsed and open in bounded overlay panels', () => {
  assert.match(layouts, /compactAccordion\('participants', 'Participants'/);
  assert.match(layouts, /compactAccordion\('log', 'Combat Log'/);
  assert.match(layouts, /name="\$\{escapeAttribute\(group\)\}"/);
  assert.match(layoutsCss, /\.cockpit-secondary-panel\[open\] > div\s*\{[^}]*position:\s*absolute[^}]*max-height:[^}]*overflow:\s*auto/s);
});
