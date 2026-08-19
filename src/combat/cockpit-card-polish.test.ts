import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const runtimePolishCss = readFileSync(new URL('./cockpit-weapon-runtime-polish.css', import.meta.url), 'utf8');
const actorImageCache = readFileSync(new URL('../actor-image-cache.ts', import.meta.url), 'utf8');

test('compact Character cards prefer local GBF small assets and keep names below images', () => {
  assert.match(actorImageCache, /family === 'npc' && variant !== 's'/);
  assert.match(actorImageCache, /leaderFallbackAssetId/);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-visual \.combat-image img[\s\S]*object-fit:\s*contain !important/s);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-copy\s*\{[^}]*display:\s*block/s);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-copy > strong\s*\{[^}]*display:\s*block/s);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-visual,[\s\S]*background:\s*transparent !important/s);
});

test('Weapon Grid centers weapon names', () => {
  assert.match(runtimePolishCss, /cockpit-weapon-slot \.combat-weapon-name,[\s\S]*text-align:\s*center/s);
});
