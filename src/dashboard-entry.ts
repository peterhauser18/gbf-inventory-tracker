import { backfillCharactersFromLatestCompletedDiagnosticScan } from './account/diagnostic-backfill.ts';

void bootDashboard();

async function bootDashboard(): Promise<void> {
  try {
    await backfillCharactersFromLatestCompletedDiagnosticScan();
  } catch {
    // A missing/invalid diagnostic cache must not prevent the cumulative dashboard from loading.
  }
  await import('./dashboard.ts');
}
