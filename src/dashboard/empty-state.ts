export interface PolishedEmptyState {
  title: string;
  detail: string;
  kind: 'unobserved' | 'filtered' | 'unchanged';
}

export function polishDashboardEmptyState(title: string, detail: string): PolishedEmptyState {
  if (title === 'No matching entries' && detail === 'No data was observed for this family yet.') {
    return {
      title: 'Not observed yet',
      detail: 'This data family has no local observation yet. Unknown evidence is not treated as an empty collection.',
      kind: 'unobserved',
    };
  }
  if (title === 'No matching entries' && detail === 'Try a different search.') {
    return {
      title: 'No matches',
      detail: 'No observed entries match this filter. The underlying local data is unchanged.',
      kind: 'filtered',
    };
  }
  return { title, detail, kind: 'unchanged' };
}
