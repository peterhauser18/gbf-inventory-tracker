import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const compat = readFileSync(new URL('./multi-active-compat.ts', import.meta.url), 'utf8');
const liveUi = readFileSync(new URL('./live-ui-fixes.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('./ui.ts', import.meta.url), 'utf8');

test('multi-active compat starts Participants collapsed independently per active raid', () => {
  assert.match(ui, /installCombatMultiActiveCompat\(app\)/);
  assert.ok(ui.indexOf('installCombatMultiActiveCompat(app)') < ui.indexOf('installCombatRaidInteractionUx(app)'));
  assert.match(compat, /const participantOpenByRaid = new Map<string, boolean>\(\)/);
  assert.match(compat, /\[data-combat-collapse="participants"\]/);
  assert.match(compat, /participantOpenByRaid\.set\(key, false\)/);
  assert.match(compat, /details\.addEventListener\('toggle'/);
  assert.match(compat, /data-active-combat-key/);
});

test('selected live character collapse state is scoped to its active raid and stale suppression is dropped', () => {
  assert.match(compat, /const suppressedActorByRaid = new Map<string, string>\(\)/);
  assert.match(compat, /suppressedActorByRaid\.get\(key\) === actorId/);
  assert.match(compat, /suppressedActorByRaid\.set\(key, actorId\)/);
  assert.match(compat, /suppressed && suppressed !== actorId/);
  assert.match(compat, /buttons\.some\(\(button\) => button\.dataset\.characterSelect === actorId\)/);
  assert.match(compat, /clearScopedSuppressionArtifacts\(root, key\)/);
  assert.match(compat, /activeCard\(root, key\)/);
  assert.match(compat, /event\.stopImmediatePropagation\(\)/);
});

test('retained dead or replaced roster cards toggle shared analysis without blocking later live selection', () => {
  assert.match(compat, /\[data-roster-actor-id\]/);
  assert.match(compat, /retainedActorByRaid\.get\(key\) === actorId/);
  assert.match(compat, /clearRetainedActorSelection\(root, key\)/);
  assert.match(compat, /retainedActorByRaid\.delete\(key\)/);
  assert.match(compat, /renderCombatLayout\('party-first', \{/);
  assert.match(compat, /querySelector<HTMLElement>\('\.character-analysis'\)/);
  assert.match(compat, /combat-retained-character-detail/);
  assert.match(compat, /card\.closest<HTMLElement>\('\.party-cards, \.combat-roster-history'\)/);
  assert.match(compat, /insertAdjacentElement\('afterend', detail\)/);
});

test('death/promotion UI preserves observed roster and does not relabel a promoted slot-zero actor as MC', () => {
  assert.match(liveUi, /const observedRosterByRaid = new Map<string, CombatActorContext\[]>\(\)/);
  assert.match(liveUi, /mergeObservedRosterHistory\(observedRosterByRaid\.get\(key\) \?\? \[], context\)/);
  assert.match(liveUi, /correctPromotedMainSlotLabel\(root, stableContext\)/);
  assert.match(liveUi, /actorId === mainCharacterId/);
  assert.match(liveUi, /label\?\.textContent\?\.trim\(\) !== accountName/);
  assert.match(liveUi, /if \(actor\?\.name\) label\.textContent = actor\.name/);
});

test('compat resolves missing fallback visuals per active raid without GBF requests', () => {
  assert.match(compat, /getActiveCombatRaids\(\)/);
  assert.match(compat, /actorVisualImageId\(actor\)/);
  assert.match(compat, /resolveWikiCombatAssetImage\(kind, assetId\)/);
  assert.doesNotMatch(compat, /fetch\(|XMLHttpRequest|webRequest|granbluefantasy|akamaized/);
});
