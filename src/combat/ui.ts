import './raids-v2.css';
import { CombatDashboardControllerV2 } from './dashboard-v2.ts';
import { COMBAT_LAYOUT_PRESETS, type CombatLayoutPreset } from './layouts.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
const LAYOUT_KEY = 'gbfit:combat-layout';
let selected: 'combat' | 'raids' | null = null;
let query = '';
let layout = loadLayoutPreference();
let lastSectionMarkup = '';
const controller = new CombatDashboardControllerV2(() => renderSectionIfChanged());

if (app) {
  app.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
    if (!button || button.dataset.section === 'combat' || button.dataset.section === 'raids') return;
    selected = null;
    query = '';
    lastSectionMarkup = '';
  });

  const observer = new MutationObserver(syncNavigation);
  observer.observe(app, { childList: true, subtree: true });
  void controller.refresh().then(syncNavigation).catch(syncNavigation);
  window.setInterval(() => {
    if (!selected) return;
    void controller.refresh().then(() => renderSectionIfChanged()).catch(() => {});
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

  if (selected && changed) renderSelectedShell();
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
    lastSectionMarkup = '';
    renderSelectedShell();
  });
  return button;
}

function renderSelectedShell(): void {
  if (!app || !selected) return;
  const content = app.querySelector<HTMLElement>('.content');
  const nav = app.querySelector<HTMLElement>('.nav');
  if (!content || !nav) return;

  nav.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === selected);
  });

  const title = selected === 'combat' ? 'Combat' : 'Raids';
  const description = selected === 'combat'
    ? 'Live read-only raid analytics from already-received supported combat responses.'
    : 'Local raid history, global pinned drops, personal observed rates, public wiki references, notes and normalized import/export.';
  const controls = selected === 'combat'
    ? `<label class="search combat-layout-control"><span>Layout</span><select id="combat-layout-select">${COMBAT_LAYOUT_PRESETS.map(([value, label]) => `<option value="${value}"${value === layout ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`
    : `<label class="search"><span>Search</span><input id="combat-raid-search" type="search" value="${escapeAttribute(query)}" placeholder="Raid, date, or tracked drop" autocomplete="off" /></label>`;

  content.innerHTML = `
    <header class="content-header">
      <div><p class="eyebrow">${title.toUpperCase()}</p><h2>${title}</h2><p class="muted">${description}</p></div>
      ${controls}
    </header>
    <div data-combat-section></div>
  `;

  content.querySelector<HTMLInputElement>('#combat-raid-search')?.addEventListener('input', (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    renderSectionIfChanged();
  });
  content.querySelector<HTMLSelectElement>('#combat-layout-select')?.addEventListener('change', (event) => {
    const next = parseLayout((event.currentTarget as HTMLSelectElement).value);
    if (!next) return;
    layout = next;
    localStorage.setItem(LAYOUT_KEY, layout);
    lastSectionMarkup = '';
    renderSectionIfChanged(true);
  });

  lastSectionMarkup = '';
  renderSectionIfChanged(true);
}

function renderSectionIfChanged(force = false): void {
  if (!app || !selected) return;
  const section = app.querySelector<HTMLElement>('[data-combat-section]');
  if (!section) return;
  const markup = selected === 'combat' ? controller.renderCombat(layout) : controller.renderRaids(query);
  if (!force && markup === lastSectionMarkup) return;
  lastSectionMarkup = markup;
  section.innerHTML = markup;
  controller.bind(section);
}

function loadLayoutPreference(): CombatLayoutPreset {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_KEY)) ?? 'cypher-modern';
  } catch {
    return 'cypher-modern';
  }
}

function parseLayout(value: string | null): CombatLayoutPreset | null {
  return COMBAT_LAYOUT_PRESETS.some(([candidate]) => candidate === value)
    ? value as CombatLayoutPreset
    : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
