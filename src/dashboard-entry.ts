import { ACCOUNT_DATABASE_STORAGE_KEY } from './account/storage.ts';

const RESTORE_SECTION_KEY = 'gbfit:dashboard-restore-section';
let accountDirty = false;
let reloadTimer: number | undefined;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !(ACCOUNT_DATABASE_STORAGE_KEY in changes)) return;
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

  const restoreSection = sessionStorage.getItem(RESTORE_SECTION_KEY);
  if (!restoreSection) return;
  sessionStorage.removeItem(RESTORE_SECTION_KEY);

  const button = document.querySelector<HTMLButtonElement>(`.nav-item[data-section="${cssEscape(restoreSection)}"]`);
  if (button && !button.classList.contains('active')) button.click();
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
