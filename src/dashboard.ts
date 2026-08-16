import './dashboard/styles.css';
import type { AccountFamily } from './account/database.ts';
import { loadAccountDatabase } from './account/storage.ts';
import {
  buildDashboardViewModel,
  type DashboardCard,
  type DashboardSection,
  type DashboardViewModel,
  type PlannerCard,
  type PlannerStep,
} from './dashboard/model.ts';
import {
  DASHBOARD_NAV_GROUPS,
  dashboardDestination,
  searchDashboardDestinations,
  type DashboardDestinationKey,
} from './dashboard/navigation.ts';
import { DASHBOARD_THEME_STORAGE_KEY } from './dashboard/theme.ts';
import { resolveWikiUrl } from './dashboard/resolver.ts';
import { loadWikiEntityMetadata } from './dashboard/wiki-metadata.ts';
import type { AccountSnapshot } from './types/account.ts';

const app = requiredApp();

type DashboardOwnedSection = DashboardSection | 'settings' | 'developer';

let snapshot: AccountSnapshot | null = null;
let model: DashboardViewModel | null = null;
let section: DashboardOwnedSection = 'overview';
let query = '';
let detailKey: string | null = null;
let metadataStatus: 'loading' | 'ready' | 'fallback' = 'loading';
let observedAt: Partial<Record<AccountFamily, number>> = {};
let paletteOpen = false;
let paletteQuery = '';
const expandedPlannerSteps = new Set<string>();

window.addEventListener('keydown', handleGlobalKeydown);
app.addEventListener('click', handleShellClick);
app.addEventListener('input', handleShellInput);
void load();

async function load(): Promise<void> {
  app.innerHTML = loadingShell('Loading local account database…');
  try {
    const account = await loadAccountDatabase();
    if (!account) {
      app.innerHTML = emptyShell(
        'No account data observed yet',
        'Keep playing and browsing GBF normally. Verified account responses will fill this dashboard automatically over time.',
      );
      return;
    }
    snapshot = account.snapshot;
    observedAt = account.observedAt;
    model = buildDashboardViewModel(snapshot);
    render();

    try {
      const metadata = await loadWikiEntityMetadata();
      if (!snapshot) return;
      model = buildDashboardViewModel(snapshot, metadata);
      metadataStatus = 'ready';
      render();
    } catch {
      metadataStatus = 'fallback';
      render();
    }
  } catch (error) {
    app.innerHTML = emptyShell('Dashboard could not load', error instanceof Error ? error.message : String(error));
  }
}

function render(): void {
  if (!model) return;
  const cards = isEntitySection(section) ? cardsForSection(model, section) : [];
  const filtered = isEntitySection(section) ? filterCards(cards, query) : [];

  app.innerHTML = `
    <div class="dashboard-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">◇</span>
          <div>
            <p class="eyebrow">COMPACT ANALYST</p>
            <h1>GBF Tool</h1>
            <p class="muted">Local read-only analysis</p>
          </div>
        </div>
        <nav class="nav" aria-label="Dashboard sections">
          ${renderNavigation()}
        </nav>
        <div class="sidebar-note">
          <strong>Local status</strong>
          <span>Latest snapshot: ${escapeHtml(formatDate(model.capturedAt))}</span>
          <span>${escapeHtml(metadataMessage(metadataStatus))}</span>
          <span>Dashboard navigation and analysis send no gameplay or refresh requests.</span>
        </div>
      </aside>

      <main class="content">
        <div class="command-bar">
          <button class="command-trigger" type="button" data-command-trigger aria-haspopup="dialog">
            <span class="command-icon" aria-hidden="true">⌕</span>
            <span>Search or jump to a dashboard area…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span class="read-only-pill">Read-only</span>
        </div>
        <header class="content-header">
          <div>
            <p class="eyebrow">${escapeHtml(sectionLabel(section).toUpperCase())}</p>
            <h2>${escapeHtml(sectionLabel(section))}</h2>
            <p class="muted">${escapeHtml(sectionDescription(section))}</p>
          </div>
          ${isEntitySection(section) ? `
            <label class="search">
              <span>Filter this view</span>
              <input id="search" type="search" value="${escapeAttribute(query)}" placeholder="Name or technical ID" autocomplete="off" />
            </label>
          ` : ''}
        </header>

        ${renderSectionContent(model, filtered, cards.length)}
      </main>

      ${detailKey ? renderDetail(model, detailKey) : ''}
    </div>
  `;

  bindEvents();
  syncCommandPalette();
}

function renderNavigation(): string {
  return DASHBOARD_NAV_GROUPS.map((group) => `
    <div class="nav-group" data-nav-group="${group.key}">
      <span class="nav-group-label">${escapeHtml(group.label)}</span>
      ${group.destinations.map((key) => {
        const destination = dashboardDestination(key);
        const isExternal = destination.owner === 'combat';
        return `
          <button
            class="nav-item ${section === key ? 'active' : ''}"
            type="button"
            data-section="${key}"
            ${isExternal ? 'data-external-section="true"' : ''}
          >
            <span class="nav-marker" aria-hidden="true"></span>
            <span>${escapeHtml(destination.label)}</span>
          </button>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderSectionContent(view: DashboardViewModel, filtered: DashboardCard[], total: number): string {
  if (section === 'overview') return renderOverview(view, observedAt);
  if (section === 'settings') return renderSettings(view, observedAt);
  if (section === 'developer') return renderDeveloper(view, observedAt);
  return renderCardCollection(filtered, total);
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>('.nav-item[data-section]:not([data-external-section])').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.section as DashboardOwnedSection | undefined;
      if (!target) return;
      navigateToOwnedSection(target);
    });
  });





  app.querySelector<HTMLInputElement>('#search')?.addEventListener('input', (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    render();
    const search = app.querySelector<HTMLInputElement>('#search');
    search?.focus();
    search?.setSelectionRange(query.length, query.length);
  });

  app.querySelectorAll<HTMLButtonElement>('[data-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      detailKey = button.dataset.detail ?? null;
      expandedPlannerSteps.clear();
      render();
    });
  });

  app.querySelectorAll<HTMLElement>('[data-close-detail]').forEach((element) => {
    element.addEventListener('click', () => {
      detailKey = null;
      expandedPlannerSteps.clear();
      render();
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-planner-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.plannerStep;
      if (!key) return;
      if (expandedPlannerSteps.has(key)) expandedPlannerSteps.delete(key);
      else expandedPlannerSteps.add(key);
      render();
    });
  });

  app.querySelectorAll<HTMLImageElement>('[data-entity-image]').forEach((image) => {
    image.addEventListener('error', () => image.remove(), { once: true });
  });
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if (event.key === 'Escape' && paletteOpen) {
    event.preventDefault();
    closeCommandPalette();
  }
}

function handleShellClick(event: Event): void {
  const target = event.target as Element | null;
  if (target?.closest('[data-command-trigger]')) {
    openCommandPalette();
    return;
  }
  const destinationButton = target?.closest<HTMLButtonElement>('[data-command-destination]');
  if (destinationButton) {
    const key = destinationButton.dataset.commandDestination as DashboardDestinationKey | undefined;
    if (key) navigateToDestination(key);
    return;
  }
  if (target?.closest('[data-command-close]')) closeCommandPalette();
}

function handleShellInput(event: Event): void {
  const input = (event.target as Element | null)?.closest<HTMLInputElement>('[data-command-search]');
  if (!input) return;
  paletteQuery = input.value;
  syncCommandPalette();
  focusPaletteSearch();
}

function openCommandPalette(): void {
  paletteOpen = true;
  paletteQuery = '';
  syncCommandPalette();
  focusPaletteSearch();
}

function closeCommandPalette(): void {
  paletteOpen = false;
  paletteQuery = '';
  syncCommandPalette();
}

function syncCommandPalette(): void {
  app.querySelector('[data-command-layer]')?.remove();
  if (!paletteOpen) return;
  const shell = app.querySelector<HTMLElement>('.dashboard-shell');
  if (!shell) return;
  shell.insertAdjacentHTML('beforeend', renderCommandPalette());
}

function navigateToDestination(key: DashboardDestinationKey): void {
  const destination = dashboardDestination(key);
  closeCommandPalette();
  const navButton = app.querySelector<HTMLButtonElement>(`.nav-item[data-section="${key}"]`);
  if (navButton) {
    navButton.click();
    return;
  }
  if (destination.owner === 'dashboard') navigateToOwnedSection(key as DashboardOwnedSection);
}

function navigateToOwnedSection(target: DashboardOwnedSection): void {
  section = target;
  query = '';
  detailKey = null;
  expandedPlannerSteps.clear();
  paletteOpen = false;
  paletteQuery = '';
  render();
}

function focusPaletteSearch(): void {
  queueMicrotask(() => {
    const input = app.querySelector<HTMLInputElement>('[data-command-search]');
    input?.focus();
    input?.setSelectionRange(paletteQuery.length, paletteQuery.length);
  });
}

function renderCommandPalette(): string {
  const results = searchDashboardDestinations(paletteQuery);
  return `
    <div data-command-layer>
      <div class="command-backdrop" data-command-close></div>
      <section class="command-palette" role="dialog" aria-modal="true" aria-label="Dashboard command palette">
      <div class="command-search-wrap">
        <span aria-hidden="true">⌕</span>
        <input data-command-search type="search" value="${escapeAttribute(paletteQuery)}" placeholder="Search dashboard areas and local tools…" autocomplete="off" />
        <kbd>Esc</kbd>
      </div>
      <div class="command-results">
        ${results.length ? results.map((destination) => `
          <button type="button" class="command-result" data-command-destination="${destination.key}">
            <span>
              <strong>${escapeHtml(destination.label)}</strong>
              <small>${escapeHtml(destination.description)}</small>
            </span>
            <span class="command-group">${escapeHtml(destination.group)}</span>
          </button>
        `).join('') : '<div class="command-empty"><strong>No local destination found</strong><span>Try a section name such as Combat, Inventory, Settings or Developer.</span></div>'}
      </div>
        <footer class="command-footer">Local navigation only · no GBF request is triggered by this palette.</footer>
      </section>
    </div>
  `;
}

function renderOverview(view: DashboardViewModel, freshness: Partial<Record<AccountFamily, number>>): string {
  return `
    <section class="overview-grid">
      ${view.stats.map((stat) => `
        <article class="metric-card">
          <div class="metric-head">
            <span>${escapeHtml(stat.label)}</span>
            ${qualityChip(stat.quality)}
          </div>
          <strong>${escapeHtml(formatNumber(stat.count))}</strong>
        </article>
      `).join('')}
    </section>
    <section class="overview-panel">
      <div>
        <p class="eyebrow">PLANNER</p>
        <h3>Eternals & Evokers</h3>
        <p class="muted">Open an Eternal or Evoker to inspect each verified upgrade stage separately. Material rows use proven local quantities only; unsupported prerequisites stay unknown instead of becoming zero.</p>
      </div>
      <div class="quality-list">
        ${qualityFreshnessRow('Characters', view.quality.characters, freshness.characters)}
        ${qualityFreshnessRow('Weapons', view.quality.weapons, freshness.weapons)}
        ${qualityFreshnessRow('Summons', view.quality.summons, freshness.summons)}
        ${qualityFreshnessRow('Treasures', view.quality.treasures, freshness.treasures)}
        ${qualityFreshnessRow('Progression evidence', view.quality.progression, freshness.progression)}
      </div>
    </section>
  `;
}

function renderSettings(view: DashboardViewModel, freshness: Partial<Record<AccountFamily, number>>): string {
  const preference = currentThemePreference();
  return `
    <section class="system-grid">
      <article class="system-card">
        <p class="eyebrow">APPEARANCE</p>
        <h3>Compact Analyst</h3>
        <p class="muted">Dark is the default for new installs. A stored light/dark preference remains local to this dashboard.</p>
        <div class="settings-row">
          <span>Current theme</span>
          <strong data-theme-preference>${escapeHtml(preference)}</strong>
        </div>
        <button class="settings-action" type="button" data-theme-toggle>Toggle theme</button>
      </article>
      <article class="system-card">
        <p class="eyebrow">LOCAL STATUS</p>
        <h3>Observed data</h3>
        <p class="muted">Missing observations stay unknown; this page never substitutes zero or false for unavailable local evidence.</p>
        <div class="quality-list settings-quality-list">
          ${qualityFreshnessRow('Characters', view.quality.characters, freshness.characters)}
          ${qualityFreshnessRow('Weapons', view.quality.weapons, freshness.weapons)}
          ${qualityFreshnessRow('Summons', view.quality.summons, freshness.summons)}
          ${qualityFreshnessRow('Treasures', view.quality.treasures, freshness.treasures)}
          ${qualityFreshnessRow('Progression evidence', view.quality.progression, freshness.progression)}
        </div>
      </article>
      <article class="system-card system-card-wide">
        <p class="eyebrow">READ-ONLY BOUNDARY</p>
        <h3>Account behavior unchanged</h3>
        <div class="status-list">
          <div><span>Latest normalized snapshot</span><strong>${escapeHtml(formatDate(view.capturedAt))}</strong></div>
          <div><span>Public metadata</span><strong>${escapeHtml(metadataStatusLabel(metadataStatus))}</strong></div>
          <div><span>Gameplay requests from dashboard</span><strong>None</strong></div>
        </div>
      </article>
    </section>
  `;
}

function renderDeveloper(view: DashboardViewModel, freshness: Partial<Record<AccountFamily, number>>): string {
  const observedFamilies = Object.values(freshness).filter((value) => value !== undefined).length;
  return `
    <section class="system-grid">
      <article class="system-card system-card-wide developer-card">
        <p class="eyebrow">DEVELOPER</p>
        <h3>Diagnostics are intentionally isolated</h3>
        <p class="muted">Manual observation, sanitized capture export and local-storage cleanup remain under the collapsed Developer menu in the extension popup. They are not part of normal dashboard navigation and do not start automatically.</p>
        <div class="status-list">
          <div><span>Observed account families</span><strong>${escapeHtml(String(observedFamilies))} / 5</strong></div>
          <div><span>Dashboard snapshot</span><strong>${escapeHtml(formatDate(view.capturedAt))}</strong></div>
          <div><span>Wiki metadata state</span><strong>${escapeHtml(metadataStatusLabel(metadataStatus))}</strong></div>
        </div>
      </article>
      <article class="system-card">
        <p class="eyebrow">LOCAL STORAGE</p>
        <h3>Cleanup controls</h3>
        <p class="muted">Open the extension popup → Developer to clear diagnostic scans or optional local histories. Account and UI preference retention follows the labels shown there.</p>
        <span class="developer-badge">Local-only tooling</span>
      </article>
      <article class="system-card">
        <p class="eyebrow">OBSERVATION</p>
        <h3>Manual diagnostic scan</h3>
        <p class="muted">Observation is controlled from the extension popup and is never started by opening this dashboard. This surface only reads locally accumulated analysis state.</p>
        <span class="developer-badge">Explicit opt-in only</span>
      </article>
    </section>
  `;
}

function renderCardCollection(cards: DashboardCard[], total: number): string {
  if (cards.length === 0) {
    return `<div class="empty"><strong>No matching entries</strong><span>${total === 0 ? 'No data was observed for this family yet.' : 'Try a different search.'}</span></div>`;
  }
  return `
    <div class="result-count">Showing ${escapeHtml(formatNumber(cards.length))} of ${escapeHtml(formatNumber(total))}</div>
    <section class="entity-grid">
      ${cards.map(renderCard).join('')}
    </section>
  `;
}

function renderCard(card: DashboardCard): string {
  const target = isPlannerCard(card)
    ? `<span class="target ${card.targetReached === true ? 'done' : ''}">${card.targetReached === true ? `${escapeHtml(card.targetDisplay)} reached` : card.targetReached === false ? `${escapeHtml(card.targetDisplay)} next` : `${escapeHtml(card.targetDisplay)} · state unknown`}</span>`
    : '';
  return `
    <article class="entity-card">
      <button class="card-open" type="button" data-detail="${escapeAttribute(card.key)}">
        ${renderVisual(card)}
        <span class="card-copy">
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.subtitle)}</span>
          <span class="card-meta">${qualityChip(card.quality)} ${target}</span>
        </span>
      </button>
      <a class="wiki-link" href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="Open ${escapeAttribute(card.title)} on GBF Wiki">Wiki ↗</a>
    </article>
  `;
}

function renderDetail(view: DashboardViewModel, key: string): string {
  const card = findCard(view, key);
  if (!card) return '';
  const planner = isPlannerCard(card) ? renderPlannerDetail(card) : '';
  const children = card.children?.length
    ? `<section class="detail-section"><h4>Weapons in this stash</h4><div class="child-list">${card.children.map(renderCompactChild).join('')}</div></section>`
    : '';
  return `
    <div class="detail-backdrop" data-close-detail></div>
    <aside class="detail-panel" aria-label="${escapeAttribute(card.title)} detail">
      <div class="detail-head">
        <div class="detail-title">
          ${renderVisual(card, true)}
          <div>
            <p class="eyebrow">${escapeHtml(card.kind.toUpperCase())}</p>
            <h3>${escapeHtml(card.title)}</h3>
            <p class="muted">${escapeHtml(card.subtitle)}</p>
          </div>
        </div>
        <button class="close" type="button" data-close-detail aria-label="Close detail">×</button>
      </div>
      <div class="detail-actions">
        <a class="external-button" href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open GBF Wiki ↗</a>
      </div>
      <section class="detail-section">
        <h4>Observed facts</h4>
        <dl class="facts">
          ${card.detailFields.map((field) => `
            <div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)} ${field.state ? qualityChip(field.state) : ''}</dd></div>
          `).join('')}
        </dl>
      </section>
      ${planner}
      ${children}
    </aside>
  `;
}

function renderPlannerDetail(card: PlannerCard): string {
  return `
    <section class="detail-section planner-section">
      <div class="section-heading"><h4>Upgrade stages</h4><span class="step-count">${card.steps.length} modeled</span></div>
      <p class="muted">Click a stage to show or hide its Have / Required / Missing table. Only verified recipes are modeled; later unsupported stages are not guessed.</p>
      <div class="planner-steps">
        ${card.steps.map((step) => renderPlannerStep(card, step)).join('')}
      </div>
      ${card.notes.length ? `<div class="notice"><strong>Later stages</strong><span>${escapeHtml(card.notes.join(' '))}</span></div>` : ''}
    </section>
  `;
}

function renderPlannerStep(card: PlannerCard, step: PlannerStep): string {
  const key = plannerStepKey(card, step);
  const expanded = expandedPlannerSteps.has(key);
  const state = step.targetReached === true ? 'reached' : step.targetReached === false ? 'not reached' : 'state unknown';
  return `
    <article class="planner-step ${expanded ? 'expanded' : ''}">
      <button class="planner-step-toggle" type="button" data-planner-step="${escapeAttribute(key)}" aria-expanded="${expanded}">
        <span class="step-target">${escapeHtml(step.targetDisplay)}</span>
        <span class="step-copy"><strong>${escapeHtml(step.targetLabel)}</strong><span>${escapeHtml(state)}</span></span>
        ${qualityChip(step.materialPlan.quality)}
        <span class="chevron" aria-hidden="true">${expanded ? '−' : '+'}</span>
      </button>
      ${expanded ? renderPlannerStepBody(step) : ''}
    </article>
  `;
}

function renderPlannerStepBody(step: PlannerStep): string {
  return `
    <div class="planner-step-body">
      <p class="muted">Have / Required / Missing uses only quantities explicitly present in the local account database. Untracked currencies and unsupported prerequisites stay unknown.</p>
      <div class="material-table" role="table" aria-label="${escapeAttribute(step.targetLabel)} material requirements">
        <div class="material-row header" role="row"><span>Material</span><span>Have</span><span>Required</span><span>Missing</span></div>
        ${step.materialPlan.materials.map((material) => {
          const wikiUrl = resolveWikiUrl({ wikiTitle: material.wikiTitle, displayName: material.name, publicId: material.itemId });
          return `<div class="material-row" role="row">
            <span><a href="${escapeAttribute(wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(material.name)} ↗</a></span>
            <span>${material.state === 'known' ? escapeHtml(formatNumber(material.owned ?? 0)) : '?'}</span>
            <span>${escapeHtml(formatNumber(material.quantity))}</span>
            <span class="${material.state === 'known' && (material.missing ?? 0) === 0 ? 'enough' : ''}">${material.state === 'known' ? escapeHtml(formatNumber(material.missing ?? 0)) : '?'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="prerequisites">
        <h4>Prerequisite evidence</h4>
        ${step.prerequisiteEvidence.map((evidence) => `
          <div class="evidence-row">
            <span>${escapeHtml(evidence.label)}</span>
            <strong class="${evidence.state === 'unknown' ? 'unknown' : evidence.satisfied ? 'enough' : 'missing'}">${evidence.state === 'unknown' ? 'unknown' : evidence.satisfied ? 'yes' : 'no'}${evidence.value ? ` · ${escapeHtml(evidence.value)}` : ''}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCompactChild(card: DashboardCard): string {
  return `
    <div class="child-row">
      <button type="button" data-detail="${escapeAttribute(card.key)}">
        ${renderVisual(card, false, true)}
        <span class="child-copy"><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.subtitle)}</span></span>
      </button>
      <a href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Wiki ↗</a>
    </div>
  `;
}

function renderVisual(card: DashboardCard, large = false, compact = false): string {
  const classes = ['entity-visual', card.kind, large ? 'large' : '', compact ? 'compact' : ''].filter(Boolean).join(' ');
  const placeholder = `<span class="placeholder ${large ? 'large' : ''}" aria-hidden="true">${escapeHtml(initials(card.title))}</span>`;
  if (!card.imageUrl) return `<span class="${classes}">${placeholder}</span>`;
  return `<span class="${classes}">${placeholder}<img data-entity-image src="${escapeAttribute(card.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>`;
}

function plannerStepKey(card: PlannerCard, step: PlannerStep): string {
  return `${card.key}:${step.goalId}`;
}

function cardsForSection(view: DashboardViewModel, selected: DashboardSection): DashboardCard[] {
  switch (selected) {
    case 'overview': return [];
    case 'eternals': return view.eternals;
    case 'evokers': return view.evokers;
    case 'characters': return view.characters;
    case 'weapons': return view.weapons;
    case 'summons': return view.summons;
    case 'treasures': return view.treasures;
    case 'consumables': return [...view.consumables, ...view.tickets];
    case 'stashes': return view.stashes;
  }
}

function isEntitySection(value: DashboardOwnedSection): value is Exclude<DashboardSection, 'overview'> {
  return value !== 'overview' && value !== 'settings' && value !== 'developer';
}

function findCard(view: DashboardViewModel, key: string): DashboardCard | undefined {
  const topLevel = [
    ...view.eternals,
    ...view.evokers,
    ...view.characters,
    ...view.weapons,
    ...view.summons,
    ...view.treasures,
    ...view.consumables,
    ...view.tickets,
    ...view.stashes,
  ];
  for (const card of topLevel) {
    if (card.key === key) return card;
    const child = card.children?.find((candidate) => candidate.key === key);
    if (child) return child;
  }
  return undefined;
}

function filterCards(cards: DashboardCard[], value: string): DashboardCard[] {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return cards;
  return cards.filter((card) => [card.title, card.subtitle, ...card.detailFields.map((field) => field.value)]
    .some((candidate) => candidate.toLowerCase().includes(normalized)));
}

function qualityChip(quality: 'known' | 'partial' | 'unknown'): string {
  return `<span class="quality ${quality}">${quality}</span>`;
}

function qualityFreshnessRow(
  label: string,
  quality: 'known' | 'partial' | 'unknown',
  lastObserved: number | undefined,
): string {
  const freshness = lastObserved === undefined ? 'never observed' : `last observed ${formatDate(lastObserved)}`;
  return `<div class="quality-row"><span>${escapeHtml(label)} · <small class="muted">${escapeHtml(freshness)}</small></span>${qualityChip(quality)}</div>`;
}

function isPlannerCard(card: DashboardCard): card is PlannerCard {
  return card.kind === 'eternal' || card.kind === 'evoker';
}

function sectionLabel(value: DashboardOwnedSection): string {
  return dashboardDestination(value).label;
}

function sectionDescription(value: DashboardOwnedSection): string {
  return dashboardDestination(value).description;
}

function metadataMessage(status: typeof metadataStatus): string {
  switch (status) {
    case 'loading': return 'Resolving public names/images from GBF Wiki…';
    case 'ready': return 'Public names/images resolved from GBF Wiki.';
    case 'fallback': return 'GBF Wiki metadata unavailable; technical-ID fallback active.';
  }
}

function metadataStatusLabel(status: typeof metadataStatus): string {
  switch (status) {
    case 'loading': return 'loading';
    case 'ready': return 'available';
    case 'fallback': return 'unavailable · technical fallback';
  }
}

function currentThemePreference(): string {
  const active = document.documentElement.dataset.theme;
  if (active === 'light' || active === 'dark') return active;
  try {
    const stored = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark';
  } catch {
    return 'dark · local storage unavailable';
  }
}

function loadingShell(message: string): string {
  return `<div class="standalone"><p class="eyebrow">GBF TOOL</p><h1>Dashboard</h1><p class="muted">${escapeHtml(message)}</p></div>`;
}

function emptyShell(title: string, detail: string): string {
  return `<div class="standalone"><p class="eyebrow">GBF TOOL</p><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(detail)}</p></div>`;
}

function initials(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : value.slice(0, 2)).toUpperCase();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(timestamp: number): string {
  return timestamp > 0 ? new Date(timestamp).toLocaleString() : 'unknown time';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function requiredApp(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#dashboard-app');
  if (!element) throw new Error('Missing #dashboard-app root');
  return element;
}
