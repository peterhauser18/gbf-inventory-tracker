import './dashboard/theme.css';
import './dashboard/styles.css';
import './combat/standalone.css';
import './combat/ui.ts';
import { DASHBOARD_THEME_STORAGE_KEY, parseDashboardTheme } from './dashboard/theme.ts';

applyStoredTheme();

document.querySelector<HTMLButtonElement>('.combat-standalone-tabs .nav-item[data-section="combat"]')?.click();

function applyStoredTheme(): void {
  let theme: 'light' | 'dark' = 'dark';
  try {
    theme = parseDashboardTheme(localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY));
  } catch {
    // Keep the dark first paint when localStorage is unavailable.
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
