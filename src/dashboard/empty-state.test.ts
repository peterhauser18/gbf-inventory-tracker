import assert from 'node:assert/strict';
import test from 'node:test';
import { polishDashboardEmptyState } from './empty-state.ts';

test('distinguishes unobserved families from an observed filter with no matches', () => {
  const unobserved = polishDashboardEmptyState('No matching entries', 'No data was observed for this family yet.');
  const filtered = polishDashboardEmptyState('No matching entries', 'Try a different search.');
  assert.equal(unobserved.kind, 'unobserved');
  assert.match(unobserved.detail, /Unavailable evidence is not treated as an empty collection/);
  assert.equal(filtered.kind, 'filtered');
  assert.match(filtered.detail, /underlying local data is unchanged/);
});

test('leaves specialized empty states unchanged', () => {
  assert.deepEqual(polishDashboardEmptyState('No raid records', 'Nothing here.'), {
    title: 'No raid records', detail: 'Nothing here.', kind: 'unchanged',
  });
});
