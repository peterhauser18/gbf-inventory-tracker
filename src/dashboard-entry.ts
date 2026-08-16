import './dashboard/theme.css';
import { ACCOUNT_DATABASE_VERSION } from './account/database.ts';
import { ACCOUNT_DATABASE_STORAGE_KEY } from './account/storage.ts';
import {
  changedAccountEvidence,
  sectionUsesAccountEvidence,
  type AccountEvidenceKey,
} from './dashboard/live-refresh.ts';
import { groupPlannerSteps } from './dashboard/planner-step-groups.ts';
import './dashboard/planner-reached.css';
import { DASHBOARD_THEME_STORAGE_KEY, parseDashboardTheme } from './dashboard/theme.ts';

const RESTORE_SECTION_KEY = 'gbfit:dashboard-restore-section';
const dirtyEvidence = new Set<AccountEvidenceKey>();
const enhancementLoads = new Map<string, Promise<void>>();
const loadedEnhancements = new Set<string>();
let reloadTimer: number | undefined;
let firstAccountSnapshotPending = false;
let openReachedEternal: string | undefined;

applyStoredTheme();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const change = changes[ACCOUNT_DATABASE_STORAGE_KEY];
  if (!change) return;

  const firstSnapshotAvailable = !hasStoredAccountSnapshot(change.oldValue) && hasStoredAccountSnapshot(change.newValue);
  if (firstSnapshotAvailable && !activeSection()) {
    firstAccountSnapshotPending = true;
    if (document.visibilityState === 'visible') scheduleFirstSnapshotReload();
    return;
  }

  const changed = changedAccountEvidence(change.oldValue, change.newValue);
  if (changed.length === 0) return;
  for (const key of changed) dirtyEvidence.add(key);

  const section = activeSection();
  if (!section || !sectionUsesAccountEvidence(section, changed)) return;
  if (document.visibilityState === 'visible') scheduleReload(section, 500);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushDirtyEvidence();
});
window.addEventListener('focus', flushDirtyEvidence);

document.addEventListener('click', (event) => {
  if (dirtyEvidence.size === 0) return;
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
  const targetSection = button?.dataset.section;
  if (!targetSection || !sectionUsesAccountEvidence(targetSection, [...dirtyEvidence])) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  scheduleReload(targetSection, 0);
}, true);

document.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  if (target?.closest('[data-detail], [data-close-detail], .nav-item[data-section]')) openReachedEternal = undefined;
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
    interceptUntilLoaded(event, nav, 'goals-page', async () => {
      await import('./dashboard/goals-ui.ts');
      await import('./dashboard/farming-ui.ts');
    });
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
    void ensureEnhancement('goals-core', async () => {
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
    for (const heading of app.querySelectorAll<HTMLElement>('.system-card h3')) {
      if (heading.textContent === 'Observation control') heading.closest<HTMLElement>('.system-card')?.remove();
    }
    polishPlannerDetail();
    collapseReachedEternalStages();
  };

  update();
  const observer = new MutationObserver(update);
  observer.observe(app, { childList: true, subtree: true });
}

function polishPlannerDetail(): void {
  const panel = document.querySelector<HTMLElement>('.detail-panel');
  if (!panel || panel.dataset.plannerFactsPolished === 'true') return;

  const kind = panel.querySelector<HTMLElement>('.detail-title .eyebrow')?.textContent?.trim();
  if (kind !== 'ETERNAL' && kind !== 'EVOKER') return;

  const factsSection = [...panel.querySelectorAll<HTMLElement>('.detail-section')].find(
    (section) => section.querySelector<HTMLElement>('h4')?.textContent?.trim() === 'Observed facts',
  );
  if (!factsSection) return;

  const factValue = (label: string): string | undefined => {
    for (const row of factsSection.querySelectorAll<HTMLElement>('.facts > div')) {
      if (row.querySelector<HTMLElement>('dt')?.textContent?.trim() !== label) continue;
      return row.querySelector<HTMLElement>('dd')?.childNodes[0]?.textContent?.trim() || undefined;
    }
    return undefined;
  };

  const level = factValue('Level');
  const uncap = factValue('Uncap');
  const awakening = factValue('Awakening');
  const compact = [
    level ? `Lv ${level}` : undefined,
    uncap ? `Uncap ${uncap}★` : undefined,
    awakening ? `Awakening ${awakening}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const subtitle = panel.querySelector<HTMLElement>('.detail-title .muted');
  if (subtitle && compact.length > 0) subtitle.textContent = compact.join(' · ');
  factsSection.remove();
  panel.dataset.plannerFactsPolished = 'true';
}

function collapseReachedEternalStages(): void {
  const panel = document.querySelector<HTMLElement>('.detail-panel');
  const planner = panel?.querySelector<HTMLElement>('.planner-section');
  if (!panel || !planner || planner.dataset.reachedGrouped === 'true') return;

  const kind = panel.querySelector<HTMLElement>('.detail-title .eyebrow')?.textContent?.trim();
  if (kind !== 'ETERNAL') return;

  const stepsContainer = planner.querySelector<HTMLElement>(':scope > .planner-steps');
  if (!stepsContainer) return;

  const stepDescriptors = [...stepsContainer.querySelectorAll<HTMLElement>(':scope > .planner-step')].map((element) => ({
    element,
    targetReached: element.querySelector<HTMLElement>('.step-copy > span')?.textContent?.trim() === 'reached',
    targetDisplay: element.querySelector<HTMLElement>('.step-target')?.textContent?.trim() ?? '',
  }));
  const groups = groupPlannerSteps('eternal', stepDescriptors);
  planner.dataset.reachedGrouped = 'true';
  if (groups.reached.length === 0 || !groups.highestReached) return;

  const eternalName = panel.querySelector<HTMLElement>('.detail-title h3')?.textContent?.trim() ?? 'Eternal';
  const reached = document.createElement('details');
  reached.className = 'planner-reached';
  reached.open = openReachedEternal === eternalName;

  const summary = document.createElement('summary');
  summary.className = 'planner-reached-summary';
  const label = document.createElement('strong');
  label.textContent = `Already uncapped to ${groups.highestReached.targetDisplay}`;
  const count = document.createElement('span');
  count.className = 'step-count';
  count.textContent = `${groups.reached.length} reached`;
  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = reached.open ? '−' : '+';
  summary.append(label, count, chevron);
  reached.append(summary);

  const reachedSteps = document.createElement('div');
  reachedSteps.className = 'planner-steps planner-reached-steps';
  for (const step of groups.reached) reachedSteps.append(step.element);
  reached.append(reachedSteps);
  stepsContainer.insertAdjacentElement('afterend', reached);
  stepsContainer.hidden = groups.visible.length === 0;

  reached.addEventListener('toggle', () => {
    chevron.textContent = reached.open ? '−' : '+';
    if (reached.open) openReachedEternal = eternalName;
    else if (openReachedEternal === eternalName) openReachedEternal = undefined;
  });
}

function flushDirtyEvidence(): void {
  if (document.visibilityState !== 'visible') return;
  if (firstAccountSnapshotPending && !activeSection()) {
    scheduleFirstSnapshotReload();
    return;
  }
  if (dirtyEvidence.size === 0) return;
  const section = activeSection();
  if (!section || !sectionUsesAccountEvidence(section, [...dirtyEvidence])) return;
  scheduleReload(section, 0);
}

function scheduleFirstSnapshotReload(): void {
  firstAccountSnapshotPending = false;
  scheduleReload(undefined, 0);
}

function hasStoredAccountSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as { version?: unknown; snapshot?: unknown };
  return record.version === ACCOUNT_DATABASE_VERSION
    && Boolean(record.snapshot)
    && typeof record.snapshot === 'object'
    && !Array.isArray(record.snapshot);
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

function applyStoredTheme(): void {
  let theme: 'light' | 'dark' = 'dark';
  try {
    theme = parseDashboardTheme(localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY));
  } catch {
    // Keep the default dark first paint when localStorage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}
