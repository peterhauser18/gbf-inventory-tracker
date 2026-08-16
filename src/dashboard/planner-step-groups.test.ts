import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPlannerSteps } from './planner-step-groups.ts';

type Step = { id: string; targetReached?: boolean };

const step = (id: string, targetReached?: boolean): Step => ({ id, targetReached });

test('Eternal mixed progress hides only proven reached stages', () => {
  const groups = groupPlannerSteps('eternal', [
    step('5-star', true),
    step('110', true),
    step('120', false),
    step('130'),
  ]);

  assert.deepEqual(groups.visible.map(({ id }) => id), ['120', '130']);
  assert.deepEqual(groups.reached.map(({ id }) => id), ['5-star', '110']);
  assert.equal(groups.highestReached?.id, '110');
});

test('Eternal with no proven reached stage keeps every stage visible', () => {
  const groups = groupPlannerSteps('eternal', [step('5-star', false), step('110')]);

  assert.deepEqual(groups.visible.map(({ id }) => id), ['5-star', '110']);
  assert.deepEqual(groups.reached, []);
  assert.equal(groups.highestReached, undefined);
});

test('Eternal with all modeled stages reached keeps them in one reached group', () => {
  const groups = groupPlannerSteps('eternal', [step('5-star', true), step('150', true)]);

  assert.deepEqual(groups.visible, []);
  assert.deepEqual(groups.reached.map(({ id }) => id), ['5-star', '150']);
  assert.equal(groups.highestReached?.id, '150');
});

test('Evoker presentation stays unchanged even for reached stages', () => {
  const steps = [step('5-star', true), step('domain', false)];
  const groups = groupPlannerSteps('evoker', steps);

  assert.deepEqual(groups.visible, steps);
  assert.deepEqual(groups.reached, []);
  assert.equal(groups.highestReached, undefined);
});
