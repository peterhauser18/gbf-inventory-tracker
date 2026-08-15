import { CombatDashboardController } from './dashboard.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
let selected: 'combat' | 'raids' | null = null;
let query = '';
const controller = new CombatDashboardController(() => renderSelected());

if (app) {
  app.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
    if (!button || button.dataset.section === 'combat' || button.dataset.section === 'raids') return;
    selected = null;
    query = '';
  });

  const observer = new MutationObserver(syncNavigation);
  observer.observe(app, { childList: true, subtree: true });
  void controller.refresh().then(syncNavigation).catch(syncNavigation);
  window.setInterval(() => {
    if (!selected) return;
    void controller.refresh().then(renderSelected).catch(() => {});
  }, 1000);
}

function syncNavigation(): void {
  if (!app) return;
  const nav = app.querySelector<HTMLElement>('.nav');
  if (!nav) return;
  let changed = false;

  let combatButton = nav.querySelector<HTMLButtonElement>('[data-section="combat"]');
  if (!combatButton) {
    combatButton = makeNavButton('combat', 'Combat');
    const overview = nav.querySelector<HTMLElement>('[data-section="overview"]');
    if (overview) overview.insertAdjacentElement('afterend', combatButton);
    else nav.prepend(combatButton);
    changed = true;
  }

  let raidsButton = nav.querySelector<HTMLButtonElement>('[data-section="raids"]');
  if (!raidsButton) {
    raidsButton = makeNavButton('raids', 'Raids');
    combatButton.insertAdjacentElement('afterend', raidsButton);
    changed = true;
  }

  if (selected && changed) renderSelected();
}

function makeNavButton(section: 'combat' | 'raids', label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.type = 'button';
  button.dataset.section = section;
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    selected = section;
    query = '';
    renderSelected();
  });
  return button;
}

function renderSelected(): void {
  if (!app || !selected) return;
  const content = app.querySelector<HTMLElement>('.content');
  const nav = app.querySelector<HTMLElement>('.nav');
  if (!content || !nav) return;

  nav.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === selected);
  });

  const title = selected === 'combat' ? 'Combat' : 'Raids';
  const description = selected === 'combat'
    ? 'Latest supported raid facts derived only from passively received combat traffic; unknown data stays unknown.'
    : 'Local completed/left raid history, pinned drops, personal observed rates, public wiki references, notes and parse import/export.';
  const search = selected === 'raids' ? `
    <label class="search">
      <span>Search</span>
      <input id="combat-raid-search" type="search" value="${escapeAttribute(query)}" placeholder="Raid, date, or tracked drop" autocomplete="off" />
    </label>
  ` : '';

  content.innerHTML = `
    <header class="content-header">
      <div><p class="eyebrow">${title.toUpperCase()}</p><h2>${title}</h2><p class="muted">${description}</p></div>
      ${search}
    </header>
    <div data-combat-section>${selected === 'combat' ? controller.renderCombat() : controller.renderRaids(query)}</div>
  `;

  content.querySelector<HTMLInputElement>('#combat-raid-search')?.addEventListener('input', (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    renderSelected();
    const searchInput = content.querySelector<HTMLInputElement>('#combat-raid-search');
    searchInput?.focus();
    searchInput?.setSelectionRange(query.length, query.length);
  });
  controller.bind(content);
}

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}
