import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const runtimePolishCss = readFileSync(new URL('./cockpit-weapon-runtime-polish.css', import.meta.url), 'utf8');
const finalPolishCss = readFileSync(new URL('./cockpit-final-polish.css', import.meta.url), 'utf8');
const finalPolish = readFileSync(new URL('./cockpit-final-polish.ts', import.meta.url), 'utf8');
const sharedPresentation = readFileSync(new URL('./shared-presentation-fixes.ts', import.meta.url), 'utf8');
const actorImageCache = readFileSync(new URL('../actor-image-cache.ts', import.meta.url), 'utf8');

const compactCharacterAndSummonCardRule = /cockpit-characters-panel \.party-card,\s*[\s\S]*cockpit-summons-panel \.summon-card\s*\{[^}]*height:\s*auto !important/s;

test('compact Character cards mirror Summons and prefer locally observed card-sized actor art', () => {
  assert.match(actorImageCache, /\['npc', 'm'\][\s\S]*\['npc', 's'\][\s\S]*\['npc', 'ds'\]/s);
  assert.match(actorImageCache, /actorVariantAssetId\(family, variant, observedAssetId\)/);
  assert.match(finalPolish, /const ids = \[actorCardImageId\(actor\), actorVisualImageId\(actor\), actor\.id\]/);
  assert.match(finalPolishCss, /cockpit-characters-panel \.party-cards-compact\s*\{[^}]*grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/s);
  assert.match(finalPolishCss, /party-cards-compact \.party-card-visual\s*\{[^}]*aspect-ratio:\s*1 \/ 2/s);
  assert.match(runtimePolishCss, compactCharacterAndSummonCardRule);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-copy\s*\{[^}]*display:\s*block/s);
  assert.match(runtimePolishCss, /cockpit-characters-panel \.party-card-copy > strong\s*\{[^}]*display:\s*block/s);
  assert.match(finalPolishCss, /party-cards-compact \.party-card-visual \.combat-image img[\s\S]*object-fit:\s*contain !important/s);
});

test('Character backline/dead badges and Summon Main/Support roles live inside image containers', () => {
  assert.match(finalPolish, /function movePartyOverlaysIntoVisual/);
  assert.match(finalPolish, /for \(const selector of \['\.party-slot', '\.state-tag'\]\)/);
  assert.match(finalPolish, /if \(overlay && overlay\.parentElement !== visual\) visual\.append\(overlay\)/);
  assert.match(sharedPresentation, /const image = card\.querySelector<HTMLElement>\('\.combat-image'\)/);
  assert.match(sharedPresentation, /image\.append\(label\)/);
  assert.match(finalPolishCss, /party-cards-compact \.party-slot,[\s\S]*position:\s*absolute !important/s);
  assert.match(finalPolishCss, /summon-card \.combat-image > \.summon-role-label\s*\{[^}]*position:\s*absolute !important/s);
  assert.match(finalPolishCss, /summon-role-label\.support\s*\{[^}]*right:\s*4px !important/s);
});

test('Summon cards stay compact at the top instead of pushing names to the panel bottom', () => {
  assert.match(runtimePolishCss, /cockpit-summons-panel \.summon-strip\s*\{[^}]*height:\s*auto !important/s);
  assert.match(runtimePolishCss, compactCharacterAndSummonCardRule);
  assert.match(runtimePolishCss, /cockpit-summons-panel \.summon-card \.combat-image\s*\{[^}]*aspect-ratio:\s*1 \/ 2/s);
});

test('Weapon Grid centers weapon names', () => {
  assert.match(runtimePolishCss, /cockpit-weapon-slot \.combat-weapon-name,[\s\S]*text-align:\s*center/s);
});
