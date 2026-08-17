import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
const exporter = readFileSync(new URL('./export.ts', import.meta.url), 'utf8');

test('live participant display remains in session context and strips technical participant identity fields', () => {
  assert.match(storage, /chrome\.storage\.session\.get\(\[CONTEXT_STATE_KEY, LEGACY_CONTEXT_KEY\]\)/);
  assert.match(storage, /chrome\.storage\.session\.set\(\{ \[CONTEXT_STATE_KEY\]: sanitizeContextState\(state\) \}\)/);
  assert.match(storage, /participants: context\.participants\?\.slice\(0, 30\)\.map\(sanitizeParticipantDisplay\)/);
  assert.doesNotMatch(storage, /user_id|viewer_id|account_id/);
});

test('normalized raid export has no live participant display or party-slot context', () => {
  assert.doesNotMatch(exporter, /CombatParticipantDisplay|actorSlots|participants\?\.map/);
  assert.doesNotMatch(exporter, /nickname|viewer_id|user_id/);
});
