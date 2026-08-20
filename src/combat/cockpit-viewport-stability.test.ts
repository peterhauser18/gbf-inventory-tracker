import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');
const viewport = readFileSync(new URL('./cockpit-viewport-layout.ts', import.meta.url), 'utf8');
const viewportCss = readFileSync(new URL('./cockpit-viewport-layout.css', import.meta.url), 'utf8');
const preservation = readFileSync(new URL('./loadout-dom-preservation.ts', import.meta.url), 'utf8');
const loadoutUi = readFileSync(new URL('./loadout-ui.ts', import.meta.url), 'utf8');

test('Characters/Summons stay compact, Weapons expands the cockpit, and secondary panels remain below it', () => {
  assert.match(ui, /applyCockpitViewportLayout\(section\)/);
  assert.match(viewport, /:scope > \.cockpit-secondary/);
  assert.match(viewport, /cockpit\.after\(secondary\)/);
  assert.match(viewport, /cockpit-secondary-below/);
  assert.match(viewportCss, /\.active-combat-card \.preset-combat-cockpit,\s*\.raid-card \.preset-combat-cockpit\s*\{[^}]*height:\s*auto !important/s);
  assert.match(viewportCss, /:has\(\.cockpit-tab-input\[id\$="-weapons"\]:checked\)/);
  assert.match(viewportCss, /height:\s*clamp\(560px, calc\(100dvh - 96px\), 1040px\)/);
  assert.match(viewportCss, /grid-template-rows:\s*auto minmax\(0, \.78fr\) minmax\(0, 1\.22fr\)/);
  assert.match(viewportCss, /:not\(:has\(\.cockpit-tab-input\[id\$="-weapons"\]:checked\)\)[\s\S]*\.cockpit-loadout-panels,[\s\S]*height:\s*auto !important/s);
  assert.match(viewportCss, /\.cockpit-secondary-below \.cockpit-secondary-panel\[open\] > div\s*\{[^}]*position:\s*static !important/s);
});

test('live Weapons panel survives surrounding turn rerenders as the same DOM island', () => {
  assert.match(preservation, /kind: 'weapon-panel'/);
  assert.match(preservation, /\.cockpit-loadout-panel\[data-cockpit-loadout-panel="weapons"\]/);
  assert.match(preservation, /preserved\.push\(\{ owner: `active:\$\{key\}`, kind: 'weapon-panel', node: panel \}\)/);
  assert.match(preservation, /replacement\.replaceWith\(panel\)/);
  assert.match(preservation, /if \(entry\.kind !== 'weapon-panel'\) continue/);
});

test('Weapon Grid semantic fingerprint ignores observation timestamps', () => {
  const fingerprint = /function loadoutFingerprint[\s\S]*?function rememberLoadoutScroll/.exec(loadoutUi)?.[0] ?? '';
  assert.match(fingerprint, /weaponGridQuality/);
  assert.match(fingerprint, /weapons:/);
  assert.match(fingerprint, /calculator:/);
  assert.doesNotMatch(fingerprint, /updatedAt|observedAt/);
});
