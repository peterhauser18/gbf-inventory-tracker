import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { changedAccountEvidence, sectionUsesAccountEvidence } from './live-refresh.ts';

function database(
  observedAt: Record<string, number> = {},
  weaponStashes: unknown[] = [],
  quality: Record<string, string> = {},
): unknown {
  return { observedAt, snapshot: { quality, weaponStashes } };
}

test('live refresh targets only sections that use changed account families', () => {
  const previous = database({ characters: 10, weapons: 20 }, [], { characters: 'partial', weapons: 'partial' });
  const next = database({ characters: 11, weapons: 20 }, [], { characters: 'partial', weapons: 'partial' });
  const changed = changedAccountEvidence(previous, next);
  assert.deepEqual(changed, ['characters']);
  assert.equal(sectionUsesAccountEvidence('characters', changed), true);
  assert.equal(sectionUsesAccountEvidence('roster', changed), true);
  assert.equal(sectionUsesAccountEvidence('overview', changed), true);
  assert.equal(sectionUsesAccountEvidence('weapons', changed), false);
  assert.equal(sectionUsesAccountEvidence('combat', changed), false);
});

test('consumables view refreshes for either consumable or ticket evidence', () => {
  const changed = changedAccountEvidence(database({ tickets: 10 }, [], { tickets: 'partial' }), database({ tickets: 11 }, [], { tickets: 'partial' }));
  assert.deepEqual(changed, ['tickets']);
  assert.equal(sectionUsesAccountEvidence('consumables', changed), true);
});

test('weapon stash updates are tracked independently from primary weapon evidence', () => {
  const previous = database({}, [{ stashId: '1', quality: 'partial', weapons: [{ id: 'a', updatedAt: 10 }] }]);
  const next = database({}, [{ stashId: '1', quality: 'partial', weapons: [{ id: 'a', updatedAt: 11 }] }]);
  const changed = changedAccountEvidence(previous, next);
  assert.deepEqual(changed, ['weaponStashes']);
  assert.equal(sectionUsesAccountEvidence('stashes', changed), true);
  assert.equal(sectionUsesAccountEvidence('weapons', changed), false);
});

test('unchanged account evidence does not request a refresh', () => {
  const value = database({ characters: 10 }, [], { characters: 'known' });
  assert.deepEqual(changedAccountEvidence(value, structuredClone(value)), []);
  assert.equal(sectionUsesAccountEvidence('overview', []), false);
});

test('first account observation does not mark still-unknown families dirty', () => {
  const next = database({ characters: 10 }, [], { characters: 'partial', weapons: 'unknown', summons: 'unknown', artifacts: 'unknown', treasures: 'unknown', consumables: 'unknown', tickets: 'unknown', accountStatus: 'unknown', progression: 'unknown' });
  assert.deepEqual(changedAccountEvidence(undefined, next), ['characters']);
});

test('dashboard live refresh is storage-change driven rather than periodic polling', () => {
  const entry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');
  assert.match(entry, /chrome\.storage\.onChanged\.addListener/);
  assert.match(entry, /changedAccountEvidence/);
  assert.doesNotMatch(entry, /setInterval\s*\(/);
});
