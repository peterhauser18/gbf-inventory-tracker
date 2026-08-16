import './theme.css';
import {
  DASHBOARD_THEME_STORAGE_KEY,
  dashboardThemeButtonLabel,
  nextDashboardTheme,
  parseDashboardTheme,
  type DashboardTheme,
} from './theme.ts';

const root = document.documentElement;
const app = document.querySelector<HTMLElement>('#dashboard-app');
let theme = readStoredTheme();

applyTheme(theme);

if (app) {
  const observer = new MutationObserver(syncToggle);
  observer.observe(app, { childList: true, subtree: true });
  syncToggle();
}

function syncToggle(): void {
  if (!app) return;
  const buttons = app.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]');
  const label = dashboardThemeButtonLabel(theme);
  buttons.forEach((button) => {
    if (button.dataset.themeToggleBound !== 'true') {
      button.dataset.themeToggleBound = 'true';
      button.addEventListener('click', toggleTheme);
    }
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  });
}

function toggleTheme(): void {
  theme = nextDashboardTheme(theme);
  applyTheme(theme);
  writeStoredTheme(theme);
  syncToggle();
}

function applyTheme(value: DashboardTheme): void {
  root.dataset.theme = value;
  root.style.colorScheme = value;
}

function readStoredTheme(): DashboardTheme {
  try {
    return parseDashboardTheme(localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function writeStoredTheme(value: DashboardTheme): void {
  try {
    localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, value);
  } catch {
    // Theme switching still works for this session when storage is unavailable.
  }
}
