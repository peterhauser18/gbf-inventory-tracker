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
import { resolveWikiUrl } from './dashboard/resolver.ts';
import { loadWikiEntityMetadata } from './dashboard/wiki-metadata.ts';
import type { AccountSnapshot } from './types/account.ts';

const app = requiredApp();

let snapshot: AccountSnapshot | null = null;
let model: DashboardViewModel | null = null;
let section: DashboardSection = 'overview';
let query = '';
let detailKey: string | null = null;
let metadataStatus: 'loading' | 'ready' | 'fallback' = 'loading';
let observedAt: Partial<Record<AccountFamily, number>> = {};
const expandedPlannerSteps = new Set<string>();

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
  const cards = cardsForSection(model, section);
  const filtered = filterCards(cards, query);

  app.innerHTML = `
    <div class="dashboard-shell">
      <aside class="sidebar">
        <div class="brand">
          <p class="eyebrow">LOCAL-FIRST GBF COMPANION</p>
          <h1>GBF Tool</h1>
          <p class="muted">Read-only account snapshot</p>
        </div>
        <nav class="nav" aria-label="Dashboard sections">
          ${NAV_ITEMS.map(([key, label]) => `
            <button class="nav-item ${section === key ? 'active' : ''}" type="button" data-section="${key}">${escapeHtml(label)}</button>
          `).join('')}
        </nav>
        <div class="sidebar-note">
          <strong>Tracked locally</strong>
          <span>Latest observation: ${escapeHtml(formatDate(model.capturedAt))}</span>
          <span>${escapeHtml(metadataMessage(metadataStatus))}</span>
          <span>Passive tracking sends no gameplay or refresh requests.</span>
        </div>
      </aside>

      <main class="content">
        <header class="content-header">
          <div>
            <p class="eyebrow">${escapeHtml(sectionLabel(section).toUpperCase())}</p>
            <h2>${escapeHtml(sectionLabel(section))}</h2>
            <p class="muted">${escapeHtml(sectionDescription(section))}</p>
          </div>
          ${section === 'overview' ? '' : `
            <label class="search">
              <span>Search</span>
              <input id="search" type="search" value="${escapeAttribute(query)}" placeholder="Name or technical ID" autocomplete="off" />
            </label>
          `}
        </header>

        ${section === 'overview' ? renderOverview(model, observedAt) : renderCardCollection(filtered, cards.length)}
      </main>

      ${detailKey ? renderDetail(model, detailKey) : ''}
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      section = button.dataset.section as DashboardSection;
      query = '';
      detailKey = null;
      expandedPlannerSteps.clear();
      render();
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

function sectionLabel(value: DashboardSection): string {
  return NAV_ITEMS.find(([key]) => key === value)?.[1] ?? value;
}

function sectionDescription(value: DashboardSection): string {
  switch (value) {
    case 'overview': return 'Accumulated account coverage and planner readiness at a glance.';
    case 'eternals': return 'Observed Eternal state with each verified uncap/transcendence step available as an expandable material plan.';
    case 'evokers': return 'Observed Evoker state with each currently verified uncap/transcendence step and explicit unknown prerequisites.';
    case 'characters': return 'Character instances accumulated from verified responses during normal GBF use, enriched with public GBF Wiki metadata when available.';
    case 'weapons': return 'Primary weapon inventory. Incomplete observations remain marked partial.';
    case 'summons': return 'Summon instances accumulated from verified passive responses.';
    case 'treasures': return 'Treasure and material quantities explicitly observed from GBF responses.';
    case 'consumables': return 'Consumables, tickets and other item groups kept separate by technical context.';
    case 'stashes': return 'Observed weapon containers kept separate from the primary weapon inventory.';
  }
}

function metadataMessage(status: typeof metadataStatus): string {
  switch (status) {
    case 'loading': return 'Resolving public names/images from GBF Wiki…';
    case 'ready': return 'Public names/images resolved from GBF Wiki.';
    case 'fallback': return 'GBF Wiki metadata unavailable; technical-ID fallback active.';
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

const NAV_ITEMS: ReadonlyArray<readonly [DashboardSection, string]> = [
  ['overview', 'Overview'],
  ['eternals', 'Eternals'],
  ['evokers', 'Evokers'],
  ['characters', 'Characters'],
  ['weapons', 'Weapons'],
  ['summons', 'Summons'],
  ['treasures', 'Treasures'],
  ['consumables', 'Consumables / Tickets'],
  ['stashes', 'Weapon Stashes'],
];
