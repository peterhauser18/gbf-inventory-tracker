export type DashboardTheme = 'light' | 'dark';

export const DASHBOARD_THEME_STORAGE_KEY = 'gbf-tool-dashboard-theme';

export function parseDashboardTheme(value: unknown): DashboardTheme {
  return value === 'light' ? 'light' : 'dark';
}

export function nextDashboardTheme(theme: DashboardTheme): DashboardTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function dashboardThemeButtonLabel(theme: DashboardTheme): string {
  return theme === 'dark' ? 'Light mode' : 'Dark mode';
}
