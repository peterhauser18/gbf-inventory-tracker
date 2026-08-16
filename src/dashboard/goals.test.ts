import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregatePinnedMaterialDeficits,
  parseGoalPins,
  resolvePinnedGoals,
  toggleGoalPin,
  type GoalPin,
} from './goals.ts';
import type { PlannerCard, PlannerStep } from './model.ts';

function material(name: string, quantity: number, owned: number | undefined, quality: 'known' | 'partial' | 'unknown' = owned === undefined ? 'unknown' : 'known') {
  return {
    id: name.toLowerCase(), itemId: name.toLowerCase(), name, quantity, source: 'treasures' as const,
    state: owned === undefined ? 'unknown' as const : 'known' as const,
    ...(owned === undefined ? {} : { owned, missing: Math.max(0, quantity - owned) }),
    quality,
  };
}

function step(goalId: string, targetDisplay: string, targetReached: boolean | undefined, materials: ReturnType<typeof material>[], quality: 'known' | 'partial' | 'unknown' = 'known'): PlannerStep {
  return {
    goalId,
    targetLabel: targetDisplay,
    targetDisplay,
    targetReached,
    materialPlan: { goalId, quality, complete: quality === 'known' ? materials.every((entry) => entry.state === 'known' && entry.missing === 0) : undefined, materials },
    prerequisiteEvidence: [{ label: 'Character recruited', state: 'known', satisfied: true }],
  };
}

function card(key: string, title: string, steps: PlannerStep[]): PlannerCard {
  const selected = steps.find((candidate) => candidate.targetReached !== true) ?? steps.at(-1)!;
  return {
    key,
    kind: key.startsWith('evoker') ? 'evoker' : 'eternal',
    title,
    subtitle: title,
    quality: 'known',
    wikiUrl: 'https://example.test',
    detailFields: [],
    masterId: key,
    selectedGoalId: selected.goalId,
    targetLabel: selected.targetLabel,
    targetDisplay: selected.targetDisplay,
    targetReached: selected.targetReached,
    materialPlan: selected.materialPlan,
    prerequisiteEvidence: selected.prerequisiteEvidence,
    steps,
    notes: [],
  };
}

test('parses local pins defensively and keeps only the latest valid pin per planner', () => {
  const pins = parseGoalPins(JSON.stringify([
    { plannerKey: 'eternal:1', goalId: '100', pinnedAt: 1 },
    { plannerKey: 'eternal:1', goalId: '110', pinnedAt: 2 },
    { plannerKey: '', goalId: 'bad', pinnedAt: 3 },
    { plannerKey: 'evoker:2', goalId: '5star', pinnedAt: 'bad' },
  ]));
  assert.deepEqual(pins, [{ plannerKey: 'eternal:1', goalId: '110', pinnedAt: 2 }]);
  assert.deepEqual(parseGoalPins('{broken'), []);
});

test('pinning another target replaces the character target while toggling the same target removes it', () => {
  const start: GoalPin[] = [{ plannerKey: 'eternal:1', goalId: '110', pinnedAt: 1 }];
  const replaced = toggleGoalPin(start, 'eternal:1', '130', 2);
  assert.deepEqual(replaced, [{ plannerKey: 'eternal:1', goalId: '130', pinnedAt: 2 }]);
  assert.deepEqual(toggleGoalPin(replaced, 'eternal:1', '130', 3), []);
});

test('a pinned later target includes only still-unreached modeled steps through that target', () => {
  const seox = card('eternal:seox', 'Seox', [
    step('110', 'Lv 110', true, [material('A', 5, 2)]),
    step('120', 'Lv 120', false, [material('A', 7, 2)]),
    step('130', 'Lv 130', false, [material('B', 3, 1)]),
    step('140', 'Lv 140', false, [material('C', 9, 0)]),
  ]);
  const resolved = resolvePinnedGoals([seox], [{ plannerKey: seox.key, goalId: '130', pinnedAt: 1 }]);
  assert.equal(resolved.stalePins.length, 0);
  assert.deepEqual(resolved.goals[0]?.remainingSteps.map((entry) => entry.goalId), ['120', '130']);
  assert.deepEqual(resolved.goals[0]?.materials.map((entry) => [entry.name, entry.required, entry.missing]), [
    ['A', 7, 5],
    ['B', 3, 2],
  ]);
  assert.equal(resolved.goals[0]?.nextAction.kind, 'farm');
  assert.equal(resolved.goals[0]?.nextAction.title, 'Farm A');
});

test('aggregated deficits subtract proven owned inventory once across different pinned goals', () => {
  const seox = card('eternal:seox', 'Seox', [step('120', 'Lv 120', false, [material('Shared', 7, 5)])]);
  const nier = card('evoker:nier', 'Nier', [step('5star', '5★', false, [material('Shared', 6, 5)])]);
  const { goals } = resolvePinnedGoals([seox, nier], [
    { plannerKey: seox.key, goalId: '120', pinnedAt: 1 },
    { plannerKey: nier.key, goalId: '5star', pinnedAt: 2 },
  ]);
  const deficits = aggregatePinnedMaterialDeficits(goals);
  assert.deepEqual(deficits.map((entry) => [entry.name, entry.required, entry.owned, entry.missing]), [
    ['Shared', 13, 5, 8],
  ]);
});

test('unknown ownership stays unknown and prevents a false ready next action', () => {
  const nier = card('evoker:nier', 'Nier', [
    step('5star', '5★', false, [material('Idean', 10, undefined)], 'unknown'),
  ]);
  const { goals } = resolvePinnedGoals([nier], [{ plannerKey: nier.key, goalId: '5star', pinnedAt: 1 }]);
  assert.equal(goals[0]?.quality, 'partial');
  assert.equal(goals[0]?.materials[0]?.state, 'unknown');
  assert.equal(goals[0]?.materials[0]?.missing, undefined);
  assert.equal(goals[0]?.nextAction.kind, 'verify');
});

test('a proven missing material stays actionable even when the overall step is partial', () => {
  const seoxStep = step('120', 'Lv 120', false, [
    material('Known shortfall', 10, 4),
    material('Unknown item', 1, undefined),
  ], 'partial');
  const seox = card('eternal:seox', 'Seox', [seoxStep]);
  const { goals } = resolvePinnedGoals([seox], [{ plannerKey: seox.key, goalId: '120', pinnedAt: 1 }]);
  assert.equal(goals[0]?.quality, 'partial');
  assert.equal(goals[0]?.nextAction.kind, 'farm');
  assert.equal(goals[0]?.nextAction.title, 'Farm Known shortfall');
});
