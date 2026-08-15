export type LocalCleanupMode = 'diagnostic' | 'all-except-account';

export interface LocalCleanupTargets {
  clearDiagnostic(): Promise<void>;
  clearCombat(): Promise<void>;
}

export async function cleanupLocalData(
  mode: LocalCleanupMode,
  targets: LocalCleanupTargets,
): Promise<void> {
  await targets.clearDiagnostic();
  if (mode === 'all-except-account') await targets.clearCombat();
}
