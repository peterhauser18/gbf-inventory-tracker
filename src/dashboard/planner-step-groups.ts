export interface PlannerStepGroup<T> {
  visible: T[];
  reached: T[];
  highestReached?: T;
}

export function groupPlannerSteps<T extends { targetReached?: boolean }>(
  kind: 'eternal' | 'evoker',
  steps: readonly T[],
): PlannerStepGroup<T> {
  if (kind !== 'eternal') {
    return { visible: [...steps], reached: [] };
  }

  const reached = steps.filter((step) => step.targetReached === true);
  return {
    visible: steps.filter((step) => step.targetReached !== true),
    reached,
    highestReached: reached.at(-1),
  };
}
