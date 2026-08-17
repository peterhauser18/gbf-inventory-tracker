import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const compat = readFileSync(new URL('./multi-active-compat.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('multi-active compat starts Participants collapsed independently per active raid', () => {
  assert.match(ui, /installCombatMultiActiveCompat\(app\)/);
  assert.match(compat, /const participantOpenByRaid = new Map<string, boolean>\(\)/);
  assert.match(compat, /\[data-combat-collapse="participants"\]/);
  assert.match(compat, /participantOpenByRaid\.set\(key, false\)/);
  assert.match(compat, /details\.addEventListener\('toggle'/);
  assert.match(compat, /data-active-combat-key/);
});

test('retained dead or replaced roster cards toggle shared character analysis', () => {
  assert.match(compat, /\[data-roster-actor-id\]/);
  assert.match(compat, /retainedActorByRaid\.get\(key\) === actorId/);
  assert.match(compat, /retainedActorByRaid\.delete\(key\)/);
  assert.match(compat, /renderCombatLayout\('party-first', \{/);
  assert.match(compat, /querySelector<HTMLElement>\('\.character-analysis'\)/);
  assert.match(compat, /combat-retained-character-detail/);
});

test('compat resolves missing fallback visuals per active raid without GBF requests', () => {
  assert.match(compat, /getActiveCombatRaids\(\)/);
  assert.match(compat, /actorVisualImageId\(actor\)/);
  assert.match(compat, /resolveWikiCombatAssetImage\(kind, assetId\)/);
  assert.doesNotMatch(compat, /fetch\(|XMLHttpRequest|webRequest|granbluefantasy|akamaized/);
});
