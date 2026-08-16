import { ACCOUNT_DATABASE_STORAGE_KEY } from './account/storage.ts';
import {
  ACCOUNT_REFRESH_EVENT,
  changedAccountEvidence,
  sectionUsesAccountEvidence,
  type AccountEvidenceKey,
} from './dashboard/live-refresh.ts';

const dirtyEvidence = new Set<AccountEvidenceKey>();
let refreshTimer: number | undefined;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const change = changes[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!change) return;

  const changed = changedAccountEvidence(change.oldValue, change.newValue);
  if (changed.length === 0) return;
  for (const key of changed) dirtyEvidence.add(key);

  const section = activeSection();
  if (!section || !sectionUsesAccountEvidence(section, changed)) return;
  scheduleAccountRefresh(250);
});

document.addEventListener('click', (event) => {
  if (dirtyEvidence.size === 0) return;
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
  const targetSection = button?.dataset.section;
  if (!targetSection || !sectionUsesAccountEvidence(targetSection, [...dirtyEvidence])) return;

  scheduleAccountRefresh(0);
}, true);

void bootDashboard();

async function bootDashboard(): Promise<void> {
  await import('./dashboard.ts');
  keepObservationCopyAccurate();
}

function keepObservationCopyAccurate(): void {
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;

  const update = (): void => {
    for (const element of app.querySelectorAll<HTMLElement>('.sidebar-note span, .empty span')) {
      if (element.textContent === 'Passive tracking sends no gameplay or refresh requests.') {
        element.textContent = 'GBF data updates only while explicit debugger observation is active.';
      }
      if (element.textContent === 'Keep playing and browsing GBF normally. Verified account responses will fill this dashboard automatically over time.') {
        element.textContent = 'Open the extension Dashboard from an active GBF tab to start observation, then browse or play normally.';
      }
    }
  };

  update();
  const observer = new MutationObserver(update);
  observer.observe(app, { childList: true, subtree: true });
}

function activeSection(): string | undefined {
  return document.querySelector<HTMLElement>('.nav-item.active[data-section]')?.dataset.section;
}

function scheduleAccountRefresh(delay: number): void {
  if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    dirtyEvidence.clear();
    window.dispatchEvent(new Event(ACCOUNT_REFRESH_EVENT));
  }, delay);
}
