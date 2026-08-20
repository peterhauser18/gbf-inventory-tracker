import './raids-v2.css';
import './ui-v2.css';
import './cockpit-loadout-fill.css';
import './cockpit-weapon-runtime-polish.css';
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
import { applyCockpitViewportLayout } from './cockpit-viewport-layout.ts';

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
    decorateSection(section);
    return;
  }

  if (!force && selected === 'combat' && patchLiveCombatMarkup(section, markup)) {
    lastSectionMarkup = markup;
    decorateSection(section);
    return;
  }

  const preservedLoadouts = detachCombatLoadouts(section);
  const preservedStableDom = selected === 'combat' ? detachStableCombatDom(section) : undefined;
  lastSectionMarkup = markup;
  section.innerHTML = markup;
  controller.bind(section);
  restoreCombatLoadouts(section, preservedLoadouts);
  if (preservedStableDom) restoreStableCombatDom(section, preservedStableDom);
  decorateSection(section);
}

function decorateSection(section: HTMLElement): void {
  if (selected === 'combat') applyCombatLiveUiFixes(section);
  applySharedCombatPresentationFixes(section);
  if (selected === 'raids') applyCompactRaidHistory(section, query);
  applyCockpitFinalPolish(section);
  applyCockpitViewportLayout(section);
  decorateRosterAndAttackModes(section);
  decorateLoadouts(section);
}

function patchLiveCombatMarkup(section: HTMLElement, markup: string): boolean {
  const currentList = section.querySelector<HTMLElement>(':scope > .active-combat-list');
  if (!currentList) return false;

  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const first = template.content.firstElementChild;
  const nextList = first instanceof HTMLElement && first.classList.contains('active-combat-list') ? first : undefined;
  if (!nextList) return false;

  const currentCards = activeCombatCardsByKey(currentList);
  const nextCards = activeCombatCardsByKey(nextList);
  if (currentCards.size !== nextCards.size || [...currentCards.keys()].some((key) => !nextCards.has(key))) return false;

  for (const [key, currentCard] of currentCards) {
    const nextCard = nextCards.get(key);
    if (!nextCard || !patchActiveCombatCard(currentCard, nextCard)) return false;
  }

  for (const nextCard of nextList.querySelectorAll<HTMLElement>(':scope > [data-active-combat-key]')) {
    const key = nextCard.dataset.activeCombatKey;
    const currentCard = key ? currentCards.get(key) : undefined;
    if (currentCard) currentList.append(currentCard);
  }
  return true;
}

function activeCombatCardsByKey(root: ParentNode): Map<string, HTMLElement> {
  const cards = new Map<string, HTMLElement>();
  for (const card of root.querySelectorAll<HTMLElement>(':scope > [data-active-combat-key]')) {
    const key = card.dataset.activeCombatKey;
    if (!key || cards.has(key)) return new Map();
    cards.set(key, card);
  }
  return cards;
}

function patchActiveCombatCard(current: HTMLElement, next: HTMLElement): boolean {
  patchRaidHeader(current, next);
  patchLiveStats(current, next);
  if (!patchCockpitRows(current, next)) return false;
  if (!patchPartyCards(current, next)) return false;
  if (!patchSummons(current, next)) return false;
  patchSecondaryPanels(current, next);
  patchSelectedAnalysis(current, next);
  return true;
}

function patchRaidHeader(current: HTMLElement, next: HTMLElement): void {
  const currentResult = current.querySelector<HTMLElement>('.combat-raid-title .raid-result');
  const nextResult = next.querySelector<HTMLElement>('.combat-raid-title .raid-result');
  if (currentResult && nextResult) {
    currentResult.textContent = nextResult.textContent;
    currentResult.className = nextResult.className;
  }
  patchText(current, next, '.combat-raid-title h3');
  patchLabeledStrongValues(current, next, '.header-fact');

  const currentBoss = current.querySelector<HTMLElement>('.boss-hp-wide');
  const nextBoss = next.querySelector<HTMLElement>('.boss-hp-wide');
  if (!currentBoss || !nextBoss) return;
  const currentStrong = currentBoss.querySelector<HTMLElement>('strong');
  const nextStrong = nextBoss.querySelector<HTMLElement>('strong');
  if (currentStrong && nextStrong) currentStrong.textContent = nextStrong.textContent;
  const currentPercent = currentBoss.querySelector<HTMLElement>(':scope > div:first-child > span:last-child');
  const nextPercent = nextBoss.querySelector<HTMLElement>(':scope > div:first-child > span:last-child');
  if (currentPercent && nextPercent) currentPercent.textContent = nextPercent.textContent;
  const currentTrack = currentBoss.querySelector<HTMLElement>('.hp-track > span');
  const nextTrack = nextBoss.querySelector<HTMLElement>('.hp-track > span');
  if (currentTrack && nextTrack) currentTrack.setAttribute('style', nextTrack.getAttribute('style') ?? '');
}

function patchLiveStats(current: HTMLElement, next: HTMLElement): void {
  patchLabeledStrongValues(current, next, '.live-stat');
}

function patchLabeledStrongValues(current: ParentNode, next: ParentNode, selector: string): void {
  for (const nextItem of next.querySelectorAll<HTMLElement>(selector)) {
    const label = nextItem.querySelector<HTMLElement>(':scope > span')?.textContent?.trim();
    if (!label) continue;
    const currentItem = [...current.querySelectorAll<HTMLElement>(selector)].find(
      (candidate) => candidate.querySelector<HTMLElement>(':scope > span')?.textContent?.trim() === label,
    );
    const currentValue = currentItem?.querySelector<HTMLElement>(':scope > strong');
    const nextValue = nextItem.querySelector<HTMLElement>(':scope > strong');
    if (currentValue && nextValue) currentValue.textContent = nextValue.textContent;
  }
}

function patchCockpitRows(current: HTMLElement, next: HTMLElement): boolean {
  const currentRows = actorElementsById(current, '.cockpit-table button.cockpit-row[data-character-select]');
  const nextRows = actorElementsById(next, '.cockpit-table button.cockpit-row[data-character-select]');
  for (const [actorId, nextRow] of nextRows) {
    const currentRow = currentRows.get(actorId);
    if (!currentRow) return false;
    currentRow.classList.toggle('selected', nextRow.classList.contains('selected'));
    patchText(currentRow, nextRow, '.cockpit-character strong');
    patchHtml(currentRow, nextRow, '.cockpit-character .actor-hp');
    const currentCells = [...currentRow.children];
    const nextCells = [...nextRow.children];
    if (currentCells.length < 7 || nextCells.length < 8) return false;
    for (let index = 1; index <= 5; index += 1) {
      currentCells[index]!.textContent = nextCells[index]!.textContent;
    }
    currentRow.lastElementChild!.textContent = nextRow.lastElementChild!.textContent;
  }
  return true;
}

function patchPartyCards(current: HTMLElement, next: HTMLElement): boolean {
  const selector = '.cockpit-characters-panel .party-card[data-character-select]';
  const currentCards = actorElementsById(current, selector);
  const nextCards = actorElementsById(next, selector);
  for (const [actorId, nextCard] of nextCards) {
    const currentCard = currentCards.get(actorId);
    if (!currentCard) return false;
    currentCard.classList.toggle('selected', nextCard.classList.contains('selected'));
    patchText(currentCard, nextCard, '.party-card-copy > strong');
    patchHtml(currentCard, nextCard, '.party-card-copy .actor-hp');
    patchText(currentCard, nextCard, '.party-card-damage');
  }
  return true;
}

function patchSummons(current: HTMLElement, next: HTMLElement): boolean {
  const currentCards = [...current.querySelectorAll<HTMLElement>('.cockpit-summons-panel .summon-card')];
  const nextCards = [...next.querySelectorAll<HTMLElement>('.cockpit-summons-panel .summon-card')];
  if (currentCards.length !== nextCards.length) return false;
  for (let index = 0; index < currentCards.length; index += 1) {
    const currentCard = currentCards[index]!;
    const nextCard = nextCards[index]!;
    patchText(currentCard, nextCard, ':scope > strong');
    patchText(currentCard, nextCard, ':scope > span:last-child');
  }
  return true;
}

function patchSecondaryPanels(current: HTMLElement, next: HTMLElement): void {
  for (const nextPanel of next.querySelectorAll<HTMLDetailsElement>('.cockpit-secondary-panel[data-combat-collapse]')) {
    const key = nextPanel.dataset.combatCollapse;
    if (!key) continue;
    const currentPanel = [...current.querySelectorAll<HTMLDetailsElement>('.cockpit-secondary-panel[data-combat-collapse]')]
      .find((candidate) => candidate.dataset.combatCollapse === key);
    if (!currentPanel) continue;
    const currentBody = currentPanel.querySelector<HTMLElement>(':scope > div');
    const nextBody = nextPanel.querySelector<HTMLElement>(':scope > div');
    if (currentBody && nextBody && currentBody.innerHTML !== nextBody.innerHTML) currentBody.innerHTML = nextBody.innerHTML;
  }
}

function patchSelectedAnalysis(current: HTMLElement, next: HTMLElement): void {
  const currentDetails = current.querySelector<HTMLDetailsElement>('.cockpit-selected-analysis');
  const nextDetails = next.querySelector<HTMLDetailsElement>('.cockpit-selected-analysis');
  if (!currentDetails || !nextDetails) return;
  patchText(currentDetails, nextDetails, ':scope > summary');
  const currentBody = currentDetails.querySelector<HTMLElement>(':scope > div');
  const nextBody = nextDetails.querySelector<HTMLElement>(':scope > div');
  if (currentBody && nextBody && currentBody.innerHTML !== nextBody.innerHTML) currentBody.innerHTML = nextBody.innerHTML;
}

function actorElementsById(root: ParentNode, selector: string): Map<string, HTMLElement> {
  const elements = new Map<string, HTMLElement>();
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    const actorId = element.dataset.characterSelect;
    if (actorId) elements.set(actorId, element);
  }
  return elements;
}

function patchText(current: ParentNode, next: ParentNode, selector: string): void {
  const currentValue = current.querySelector<HTMLElement>(selector);
  const nextValue = next.querySelector<HTMLElement>(selector);
  if (currentValue && nextValue) currentValue.textContent = nextValue.textContent;
}

function patchHtml(current: ParentNode, next: ParentNode, selector: string): void {
  const currentValue = current.querySelector<HTMLElement>(selector);
  const nextValue = next.querySelector<HTMLElement>(selector);
  if (currentValue && nextValue && currentValue.innerHTML !== nextValue.innerHTML) {
    currentValue.innerHTML = nextValue.innerHTML;
  }
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
