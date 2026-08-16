import {
  sectionUsesAccountEvidence,
  type AccountEvidenceKey,
} from './dashboard/live-refresh.ts';

const RESTORE_SECTION_KEY = 'gbfit:dashboard-restore-section';
const dirtyEvidence = new Set<AccountEvidenceKey>();
let reloadTimer: number | undefined;

chrome.runtime.onMessage.addListener((message: { type?: string; evidence?: AccountEvidenceKey[] }) => {
  if (message?.type !== 'gbfit-dashboard-account-updated' || !Array.isArray(message.evidence)) return false;
  for (const key of message.evidence) dirtyEvidence.add(key);

  const section = activeSection();
  if (section && sectionUsesAccountEvidence(section, message.evidence)) scheduleReload(section, 500);
  return false;
});

document.addEventListener('click', (event) => {
  if (dirtyEvidence.size === 0) return;
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
  const targetSection = button?.dataset.section;
  if (!targetSection || !sectionUsesAccountEvidence(targetSection, [...dirtyEvidence])) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  scheduleReload(targetSection, 0);
}, true);

void bootDashboard();

async function bootDashboard(): Promise<void> {
  await import('./dashboard.ts');
  keepObservationCopyAccurate();

  const restoreSection = sessionStorage.getItem(RESTORE_SECTION_KEY);
  if (restoreSection) {
    restoreSectionWhenReady(restoreSection);
    return;
  }

  const section = activeSection();
  if (section && sectionUsesAccountEvidence(section, [...dirtyEvidence])) scheduleReload(section, 500);
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

function restoreSectionWhenReady(section: string): void {
  const restore = (): boolean => {
    const button = document.querySelector<HTMLButtonElement>(`.nav-item[data-section="${cssEscape(section)}"]`);
    if (!button) return false;
    sessionStorage.removeItem(RESTORE_SECTION_KEY);
    dirtyEvidence.clear();
    if (!button.classList.contains('active')) button.click();
    return true;
  };

  if (restore()) return;
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;

  const observer = new MutationObserver(() => {
    if (!restore()) return;
    observer.disconnect();
  });
  observer.observe(app, { childList: true, subtree: true });
}

function activeSection(): string | undefined {
  return document.querySelector<HTMLElement>('.nav-item.active[data-section]')?.dataset.section;
}

function scheduleReload(section: string, delay: number): void {
  sessionStorage.setItem(RESTORE_SECTION_KEY, section);
  if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => window.location.reload(), delay);
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}
