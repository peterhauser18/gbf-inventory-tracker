import assert from 'node:assert/strict';
import test from 'node:test';
import type { CombatParseContext } from './multiraid.ts';
import { mergeObservedRosterHistory } from './live-ui-state.ts';

function context(
  actorSlots: CombatParseContext['actorSlots'],
  actors: NonNullable<CombatParseContext['actors']>,
): CombatParseContext {
  return { raidTechnicalId: 'raid', instanceId: 'instance', actorSlots, actors };
}

test('observed six-character roster survives a later death/promotion snapshot that omits one prior actor', () => {
  const initialActors = [
    { id: 'a', name: 'A', alive: true },
    { id: 'b', name: 'B', alive: true },
    { id: 'c', name: 'C', alive: true },
    { id: 'd', name: 'D', alive: true },
    { id: 'e', name: 'E', alive: true },
    { id: 'f', name: 'F', alive: true },
  ];
  const initial = mergeObservedRosterHistory([], context(initialActors, initialActors));
  assert.deepEqual(initial.map((actor) => actor.id), ['a', 'b', 'c', 'd', 'e', 'f']);

  const later = mergeObservedRosterHistory(initial, context(
    [initialActors[0]!, initialActors[2]!, initialActors[3]!, initialActors[4]!],
    [
      initialActors[0]!,
      { ...initialActors[1]!, hp: 0, alive: false },
      initialActors[2]!,
      initialActors[3]!,
      initialActors[4]!,
    ],
  ));

  assert.equal(later.length, 6);
  assert.deepEqual(later.map((actor) => actor.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(later.find((actor) => actor.id === 'b')?.alive, false);
  assert.equal(later.find((actor) => actor.id === 'f')?.name, 'F');
});

test('roster continuity never invents actors when none were observed', () => {
  assert.deepEqual(mergeObservedRosterHistory([], context([], [])), []);
});
