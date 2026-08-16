import { ACCOUNT_DATABASE_STORAGE_KEY } from './account/storage.ts';

const RESTORE_SECTION_KEY = 'gbfit:dashboard-restore-section';
let accountDirty = false;
let reloadTimer: number | undefined;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const change = changes[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!characterObservationChanged(change)) return;
  accountDirty = true;

  const section = activeSection();
  if (section && section !== 'overview' && section !== 'characters') return;
  scheduleReload(section, 500);
});

document.addEventListener('click', (event) => {
  if (!accountDirty) return;
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
  const targetSection = button?.dataset.section;
  if (targetSection !== 'characters') return;

  event.preventDefault();
  event.stopImmediatePropagation();
  scheduleReload(targetSection, 0);
}, true);

void bootDashboard();

async function bootDashboard(): Promise<void> {
  await import('./dashboard.ts');
  keepObservationCopyAccurate();

  const restoreSection = sessionStorage.getItem(RESTORE_SECTION_KEY);
  if (!restoreSection) return;
  restoreSectionWhenReady(restoreSection);
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
        element.textContent = 'Start observation from the extension popup, then browse GBF normally to update this dashboard.';
      }
    }
  };

  update();
  const observer = new MutationObserver(update);
  observer.observe(app, { childList: true, subtree: true });
}

function characterObservationChanged(change: chrome.storage.StorageChange | undefined): boolean {
  if (!change) return false;
  const previous = characterObservedAt(change.oldValue);
  const next = characterObservedAt(change.newValue);
  return next !== undefined && next !== previous;
}

function characterObservedAt(value: unknown): number | undefined {
  if (!isObject(value) || !isObject(value.observedAt)) return undefined;
  const observed = value.observedAt.characters;
  return typeof observed === 'number' && Number.isFinite(observed) ? observed : undefined;
}

function restoreSectionWhenReady(section: string): void {
  const restore = (): boolean => {
    const button = document.querySelector<HTMLButtonElement>(`.nav-item[data-section="${cssEscape(section)}"]`);
    if (!button) return false;
    sessionStorage.removeItem(RESTORE_SECTION_KEY);
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

function scheduleReload(section: string | undefined, delay: number): void {
  if (section) sessionStorage.setItem(RESTORE_SECTION_KEY, section);
  if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
  reloadTimer = window.setTimeout(() => window.location.reload(), delay);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}
