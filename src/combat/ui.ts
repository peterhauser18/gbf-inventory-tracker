import './raids-v2.css';
import './ui-v2.css';
import './cockpit-loadout-fill.css';
import { CombatDashboardControllerV2 } from './dashboard-multi-active.ts';
import type { CombatLayoutPreset } from './layouts.ts';
import { installCombatRaidInteractionUx } from './interaction-ux.ts';
import { installCombatMultiActiveCompat } from './multi-active-compat.ts';
import { applyCombatLiveUiFixes, refreshCombatLiveUiState } from './live-ui-fixes.ts';
import { decorateCombatLoadouts } from './loadout-ui.ts';
import { detachCombatLoadouts, restoreCombatLoadouts } from './loadout-dom-preservation.ts';
import { detachStableCombatDom, restoreStableCombatDom } from './live-dom-preservation.ts';
import { applySharedCombatPresentationFixes } from './shared-presentation-fixes.ts';
import { applyCompactRaidHistory } from './raid-history-compact.ts';
import { decorateCockpitAttackModes } from './cockpit-attack-modes.ts';
import { applyCockpitFinalPolish, decorateCockpitRosterPresentation } from './cockpit-final-polish.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
const layout: CombatLayoutPreset = 'combat-cockpit';
let selected: 'combat' | 'raids' | null = null;
let query = '';
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

  const header = selected === 'combat'
    ? ''
    : `<header class="content-header raids-compact-header">
        <label class="search raid-history-search"><span>Search</span><input id="combat-raid-search" type="search" value="${escapeAttribute(query)}" placeholder="Raid, date, or tracked drop" autocomplete="off" /></label>
      </header>`;

  content.innerHTML = `
    <div class="command-bar">
      <button class="command-trigger" type="button" data-command-trigger aria-haspopup="dialog">
        <span class="command-icon" aria-hidden="true">⌕</span>
        <span>Search or jump to a dashboard area…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span class="read-only-pill">Read-only</span>
    </div>
    ${header}
    <div data-combat-section></div>
  `;

  content.querySelector<HTMLInputElement>('#combat-raid-search')?.addEventListener('input', (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    renderSectionIfChanged();
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
    if (selected === 'raids') applyCompactRaidHistory(section, query);
    applyCockpitFinalPolish(section);
    decorateRosterAndAttackModes(section);
    decorateLoadouts(section);
    return;
  }
  const preservedLoadouts = detachCombatLoadouts(section);
  const preservedStableDom = selected === 'combat' ? detachStableCombatDom(section) : undefined;
  lastSectionMarkup = markup;
  section.innerHTML = markup;
  controller.bind(section);
  restoreCombatLoadouts(section, preservedLoadouts);
  if (preservedStableDom) restoreStableCombatDom(section, preservedStableDom);
  if (selected === 'combat') applyCombatLiveUiFixes(section);
  applySharedCombatPresentationFixes(section);
  if (selected === 'raids') applyCompactRaidHistory(section, query);
  applyCockpitFinalPolish(section);
  decorateRosterAndAttackModes(section);
  decorateLoadouts(section);
}

function decorateRosterAndAttackModes(section: HTMLElement): void {
  void decorateCockpitRosterPresentation(section)
    .then(() => {
      if (!section.isConnected) return;
      applyCockpitFinalPolish(section);
      return decorateCockpitAttackModes(section);
    })
    .catch(() => {});
}

function decorateLoadouts(section: HTMLElement): void {
  void decorateCombatLoadouts(section)
    .then(() => {
      if (!section.isConnected) return;
      applySharedCombatPresentationFixes(section);
      applyCockpitFinalPolish(section);
    })
    .catch(() => {});
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
