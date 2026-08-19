import './raids-v2.css';
import './ui-v2.css';
import { CombatDashboardControllerV2 } from './dashboard-multi-active.ts';
import { COMBAT_LAYOUT_PRESETS, type CombatLayoutPreset } from './layouts.ts';
import { installCombatRaidInteractionUx } from './interaction-ux.ts';
import { installCombatMultiActiveCompat } from './multi-active-compat.ts';
import { applyCombatLiveUiFixes, refreshCombatLiveUiState } from './live-ui-fixes.ts';
import { decorateCombatLoadouts } from './loadout-ui.ts';
import { detachCombatLoadouts, restoreCombatLoadouts } from './loadout-dom-preservation.ts';
import { applySharedCombatPresentationFixes } from './shared-presentation-fixes.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
const LAYOUT_KEY = 'gbfit:combat-layout';
let selected: 'combat' | 'raids' | null = null;
let query = '';
let layout = loadLayoutPreference();
let lastSectionMarkup = '';
const controller = new CombatDashboardControllerV2(() => renderSectionIfChanged());

if (app) {
  installCombatMultiActiveCompat(app);
  installCombatRaidInteractionUx(app);
  app.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section]');
    if (!button || button.dataset.section === 'combat' || button.dataset.section === 'raids') return;
    selected = null;
    query = '';
    lastSectionMarkup = '';
  });

  const observer = new MutationObserver(syncNavigation);
  observer.observe(app, { childList: true, subtree: true });
  syncNavigation();
  void Promise.all([controller.refresh(), refreshCombatLiveUiState()])
    .then(() => {
      syncNavigation();
      renderSectionIfChanged();
    })
    .catch(syncNavigation);
  window.setInterval(() => {
    if (!selected) return;
    void Promise.all([controller.refresh(), refreshCombatLiveUiState()])
      .then(() => renderSectionIfChanged())
      .catch(() => {});
  }, 1000);
}

function syncNavigation(): void {
  if (!app) return;
  const nav = app.querySelector<HTMLElement>('.nav');
  if (!nav) return;
  const detailGroup = nav.querySelector<HTMLElement>('[data-nav-group="detail"]') ?? nav;

  const combatButton = ensureNavButton(detailGroup, 'combat', 'Combat');
  const raidsButton = ensureNavButton(detailGroup, 'raids', 'Raids');
  bindNavButton(combatButton, 'combat');
  bindNavButton(raidsButton, 'raids');

  if (selected) {
    nav.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.section === selected);
    });
  }
}

function ensureNavButton(parent: HTMLElement, section: 'combat' | 'raids', label: string): HTMLButtonElement {
  const existing = parent.querySelector<HTMLButtonElement>(`.nav-item[data-section="${section}"]`);
  if (existing) return existing;

  const button = document.createElement('button');
  button.className = 'nav-item';
  button.type = 'button';
  button.dataset.section = section;
  button.dataset.externalSection = 'true';
  button.innerHTML = '<span class="nav-marker" aria-hidden="true"></span><span></span>';
  const text = button.lastElementChild;
  if (text) text.textContent = label;

  const firstDashboardDetail = parent.querySelector<HTMLElement>('.nav-item:not([data-external-section])');
  if (firstDashboardDetail) parent.insertBefore(button, firstDashboardDetail);
  else parent.append(button);
  return button;
}

function bindNavButton(button: HTMLButtonElement, section: 'combat' | 'raids'): void {
  if (button.dataset.combatBound === 'true') return;
  button.dataset.combatBound = 'true';
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    selected = section;
    query = '';
    lastSectionMarkup = '';
    renderSelectedShell();
  });
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
    : 'Local raid history, global pinned drops, personal observed rates, public wiki references and normalized import/export.';
  const layoutControl = `<label class="search combat-layout-control"><span>Layout</span><select id="combat-layout-select">${COMBAT_LAYOUT_PRESETS.map(([value, label]) => `<option value="${value}"${value === layout ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
  const controls = selected === 'combat'
    ? layoutControl
    : `<label class="search"><span>Search</span><input id="combat-raid-search" type="search" value="${escapeAttribute(query)}" placeholder="Raid, date, or tracked drop" autocomplete="off" /></label>${layoutControl}`;

  content.innerHTML = `
    <div class="command-bar">
      <button class="command-trigger" type="button" data-command-trigger aria-haspopup="dialog">
        <span class="command-icon" aria-hidden="true">⌕</span>
        <span>Search or jump to a dashboard area…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span class="read-only-pill">Read-only</span>
    </div>
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
  const markup = selected === 'combat' ? controller.renderCombat(layout) : controller.renderRaids(query, layout);
  if (!force && markup === lastSectionMarkup) {
    if (selected === 'combat') applyCombatLiveUiFixes(section);
    applySharedCombatPresentationFixes(section);
    void decorateCombatLoadouts(section);
    return;
  }
  const preservedLoadouts = detachCombatLoadouts(section);
  lastSectionMarkup = markup;
  section.innerHTML = markup;
  controller.bind(section);
  if (selected === 'combat') applyCombatLiveUiFixes(section);
  applySharedCombatPresentationFixes(section);
  restoreCombatLoadouts(section, preservedLoadouts);
  void decorateCombatLoadouts(section);
}

function loadLayoutPreference(): CombatLayoutPreset {
  try {
    return parseLayout(localStorage.getItem(LAYOUT_KEY)) ?? 'combat-cockpit';
  } catch {
    return 'combat-cockpit';
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
