import { ACCOUNT_DATABASE_STORAGE_KEY } from './account/storage.ts';
import {
  changedAccountEvidence,
  sectionUsesAccountEvidence,
  type AccountEvidenceKey,
} from './dashboard/live-refresh.ts';

const RESTORE_SECTION_KEY = 'gbfit:dashboard-restore-section';
const dirtyEvidence = new Set<AccountEvidenceKey>();
const enhancementLoads = new Map<string, Promise<void>>();
const loadedEnhancements = new Set<string>();
let reloadTimer: number | undefined;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const change = changes[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!change) return;

  const changed = changedAccountEvidence(change.oldValue, change.newValue);
  if (changed.length === 0) return;
  for (const key of changed) dirtyEvidence.add(key);

  const section = activeSection();
  if (section && sectionUsesAccountEvidence(section, changed)) scheduleReload(section, 500);
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

document.addEventListener('click', handleEnhancementIntent, true);

void bootDashboard();

async function bootDashboard(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;

  const initialRender = waitForInitialDashboardRender(app);
  await import('./dashboard.ts');
  await initialRender;

  keepObservationCopyAccurate();

  const restoreSection = sessionStorage.getItem(RESTORE_SECTION_KEY);
  if (!restoreSection) return;
  restoreSectionWhenReady(restoreSection);
}

function waitForInitialDashboardRender(app: HTMLElement): Promise<void> {
  const isReady = (): boolean =>
    app.children.length > 0 && !app.textContent?.includes('Loading local account database…');

  if (isReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!isReady()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(app, { childList: true, subtree: true });
  });
}

function handleEnhancementIntent(event: MouseEvent): void {
  const target = event.target as Element | null;
  const nav = target?.closest<HTMLButtonElement>('.nav-item[data-section]');
  const section = nav?.dataset.section;

  if (nav && section === 'goals') {
    interceptUntilLoaded(event, nav, 'goals', () => Promise.all([
      import('./dashboard/goals-ui.ts'),
      import('./dashboard/farming-ui.ts'),
    ]).then(() => undefined));
    return;
  }

  if (nav && (section === 'combat' || section === 'raids')) {
    interceptUntilLoaded(event, nav, 'combat', () => Promise.all([
      import('./combat/ui.ts'),
      import('./combat/combat-compare-ui.ts'),
    ]).then(() => undefined));
    return;
  }

  if (nav && section === 'roster') {
    interceptUntilLoaded(event, nav, 'roster', async () => {
      await import('./dashboard/roster-ui.ts');
    });
    return;
  }

  if (nav && section === 'characters') {
    void ensureEnhancement('collection', async () => {
      await import('./dashboard/collection-tracker-ui.ts');
    });
  }

  if (nav && (section === 'eternals' || section === 'evokers')) {
    void ensureEnhancement('goals', async () => {
      await import('./dashboard/goals-ui.ts');
    });
  }

  if (nav && section === 'settings') {
    void ensureEnhancement('settings', () => Promise.all([
      import('./dashboard/theme-toggle.ts'),
      import('./dashboard/phase5-ui.ts'),
    ]).then(() => undefined));
  }

  const themeToggle = target?.closest<HTMLButtonElement>('[data-theme-toggle]');
  if (themeToggle && !loadedEnhancements.has('settings')) {
    interceptUntilLoaded(event, themeToggle, 'settings', () => Promise.all([
      import('./dashboard/theme-toggle.ts'),
      import('./dashboard/phase5-ui.ts'),
    ]).then(() => undefined));
  }
}

function interceptUntilLoaded(
  event: MouseEvent,
  element: HTMLElement,
  key: string,
  load: () => Promise<void>,
): void {
  if (loadedEnhancements.has(key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void ensureEnhancement(key, load).then(() => element.click()).catch(() => {});
}

function ensureEnhancement(key: string, load: () => Promise<void>): Promise<void> {
  if (loadedEnhancements.has(key)) return Promise.resolve();
  const existing = enhancementLoads.get(key);
  if (existing) return existing;

  const pending = load()
    .then(() => {
      loadedEnhancements.add(key);
    })
    .finally(() => {
      enhancementLoads.delete(key);
    });
  enhancementLoads.set(key, pending);
  return pending;
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

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}
