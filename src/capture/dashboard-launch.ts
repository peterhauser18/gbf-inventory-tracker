import type { CaptureStatusResponse } from './types.ts';

export interface DashboardLaunchDependencies {
  getStatus(): Promise<CaptureStatusResponse>;
  startObservation(): Promise<CaptureStatusResponse>;
  openDashboard(): Promise<void>;
}

export async function launchDashboardWithObservation(
  dependencies: DashboardLaunchDependencies,
): Promise<CaptureStatusResponse> {
  const current = await dependencies.getStatus();
  if (current.active) {
    await dependencies.openDashboard();
    return current;
  }

  const started = await dependencies.startObservation();
  if (!started.active) {
    throw new Error(started.error ?? started.message ?? 'Observation did not start.');
  }

  await dependencies.openDashboard();
  return started;
}
