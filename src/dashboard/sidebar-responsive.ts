import './sidebar-responsive.css';

const SIDEBAR_COLLAPSED_KEY = 'gbfit:dashboard-sidebar-collapsed';
const app = document.querySelector<HTMLElement>('#dashboard-app');
let collapsed = readCollapsedPreference();

if (app) {
  syncSidebar();
  const observer = new MutationObserver(syncSidebar);
  observer.observe(app, { childList: true });
}

function syncSidebar(): void {
  if (!app) return;
  const shell = app.querySelector<HTMLElement>('.dashboard-shell');
  const sidebar = shell?.querySelector<HTMLElement>('.sidebar');
  if (!shell || !sidebar) return;

  let toggle = sidebar.querySelector<HTMLButtonElement>('[data-dashboard-sidebar-toggle]');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'dashboard-sidebar-toggle';
    toggle.dataset.dashboardSidebarToggle = 'true';
    toggle.addEventListener('click', () => {
      collapsed = !collapsed;
      writeCollapsedPreference(collapsed);
      applySidebarState(shell, toggle!);
    });
    sidebar.prepend(toggle);
  }

  applySidebarState(shell, toggle);
}

function applySidebarState(shell: HTMLElement, toggle: HTMLButtonElement): void {
  shell.classList.toggle('dashboard-sidebar-collapsed', collapsed);
  toggle.textContent = collapsed ? '›' : '‹';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
}

function readCollapsedPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // A blocked UI preference must not interfere with Dashboard rendering.
  }
}
