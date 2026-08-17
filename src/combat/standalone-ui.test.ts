import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const combatHtml = readFileSync(new URL('../../combat.html', import.meta.url), 'utf8');
const combatEntry = readFileSync(new URL('../combat-entry.ts', import.meta.url), 'utf8');
const standaloneCss = readFileSync(new URL('./standalone.css', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

test('standalone combat page exposes exactly Combat Tracker and Raid History tabs', () => {
  const sections = [...combatHtml.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(sections, ['combat', 'raids']);
  assert.match(combatHtml, />\s*<span>Combat Tracker<\/span>/);
  assert.match(combatHtml, />\s*<span>Raid History<\/span>/);
  assert.doesNotMatch(combatHtml, /data-section="(?:overview|characters|weapons|summons|treasures|settings|developer)"/);
});

test('standalone page reuses the existing combat UI implementation instead of a copied parser or renderer', () => {
  assert.match(combatEntry, /import '\.\/combat\/ui\.ts';/);
  assert.doesNotMatch(combatEntry, /CombatDashboardControllerV2/);
  assert.doesNotMatch(combatEntry, /renderCombat\(|renderRaids\(/);
});

test('standalone mode hides dashboard-only command navigation and is included in the build', () => {
  assert.match(standaloneCss, /\.combat-standalone-content \.command-bar\s*\{\s*display:\s*none;/s);
  assert.match(viteConfig, /combat:\s*resolve\(process\.cwd\(\), 'combat\.html'\)/);
});
