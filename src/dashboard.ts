import './dashboard/styles.css';
import { getCapturedResponsesForScan, getLatestCompletedCaptureScan } from './capture/storage.ts';
import { normalizeCaptureScan } from './capture/normalize.ts';
import {
  buildDashboardViewModel,
  type DashboardCard,
  type DashboardSection,
  type DashboardViewModel,
  type PlannerCard,
} from './dashboard/model.ts';
import { resolveWikiUrl } from './dashboard/resolver.ts';

const app = requiredApp();

let model: DashboardViewModel | null = null;
let section: DashboardSection = 'overview';
let query = '';
let detailKey: string | null = null;

void load();

async function load(): Promise<void> {
  app.innerHTML = loadingShell('Loading latest completed local scan…');
  try {
    const scan = await getLatestCompletedCaptureScan();
    if (!scan) {
      app.innerHTML = emptyShell(
        'No completed scan yet',
        'Run passive observation from the extension popup, stop it, then open the dashboard again.',
      );
      return;
    }
    const records = await getCapturedResponsesForScan(scan.id);
    model = buildDashboardViewModel(normalizeCaptureScan(records));
    render();
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
          <strong>Captured locally</strong>
          <span>${escapeHtml(formatDate(model.capturedAt))}</span>
          <span>No gameplay actions or GBF image-CDN requests.</span>
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

        ${section === 'overview' ? renderOverview(model) : renderCardCollection(filtered, cards.length)}
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
      render();
    });
  });

  app.querySelector<HTMLButtonElement>('[data-close-detail]')?.addEventListener('click', () => {
    detailKey = null;
    render();
  });
}

function renderOverview(view: DashboardViewModel): string {
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
        <p class="muted">Selected final 5★ character recipes use proven local quantities only. Missing rows stay unknown instead of becoming zero. Preceding unlock paths and higher-stage recipes are deliberately not guessed.</p>
      </div>
      <div class="quality-list">
        ${qualityRow('Characters', view.quality.characters)}
        ${qualityRow('Treasures', view.quality.treasures)}
        ${qualityRow('Progression evidence', view.quality.progression)}
      </div>
    </section>
  `;
}

function renderCardCollection(cards: DashboardCard[], total: number): string {
  if (cards.length === 0) {
    return `<div class="empty"><strong>No matching entries</strong><span>${total === 0 ? 'No data was observed for this family.' : 'Try a different search.'}</span></div>`;
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
    ? `<span class="target ${card.targetReached === true ? 'done' : ''}">${card.targetReached === true ? '5★ reached' : card.targetReached === false ? '5★ target' : '5★ target · state unknown'}</span>`
    : '';
  return `
    <article class="entity-card">
      <button class="card-open" type="button" data-detail="${escapeAttribute(card.key)}">
        <span class="placeholder" aria-hidden="true">${escapeHtml(initials(card.title))}</span>
        <span class="card-copy">
          <strong>${escapeHtml(card.title)}</strong>
          <span>${escapeHtml(card.subtitle)}</span>
          <span class="card-meta">${qualityChip(card.quality)} ${target}</span>
        </span>
      </button>
      <a class="wiki-link" href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeAttribute(card.title)} on GBF Wiki">Wiki ↗</a>
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
          <span class="placeholder large" aria-hidden="true">${escapeHtml(initials(card.title))}</span>
          <div>
            <p class="eyebrow">${escapeHtml(card.kind.toUpperCase())}</p>
            <h3>${escapeHtml(card.title)}</h3>
            <p class="muted">${escapeHtml(card.subtitle)}</p>
          </div>
        </div>
        <button class="close" type="button" data-close-detail aria-label="Close detail">×</button>
      </div>
      <div class="detail-actions">
        <a class="external-button" href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer">Open GBF Wiki ↗</a>
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
  if (card.targetReached === true) {
    return `
      <section class="detail-section planner-section">
        <div class="section-heading"><h4>${escapeHtml(card.targetLabel)}</h4>${qualityChip('known')}</div>
        <div class="notice success"><strong>Target already reached</strong><span>${escapeHtml(card.notes[0] ?? 'The selected target is already observed.')}</span></div>
      </section>
    `;
  }

  return `
    <section class="detail-section planner-section">
      <div class="section-heading"><h4>${escapeHtml(card.targetLabel)}</h4>${qualityChip(card.materialPlan.quality)}</div>
      <p class="muted">Have / Required / Missing uses only quantities explicitly present in the local scan. Rupies and unsupported prerequisites remain unknown.</p>
      <div class="material-table" role="table" aria-label="Material requirements">
        <div class="material-row header" role="row"><span>Material</span><span>Have</span><span>Required</span><span>Missing</span></div>
        ${card.materialPlan.materials.map((material) => {
          const wikiUrl = resolveWikiUrl({ wikiTitle: material.wikiTitle, displayName: material.name, publicId: material.itemId });
          return `<div class="material-row" role="row">
            <span><a href="${escapeAttribute(wikiUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(material.name)} ↗</a></span>
            <span>${material.state === 'known' ? escapeHtml(formatNumber(material.owned ?? 0)) : '?'}</span>
            <span>${escapeHtml(formatNumber(material.quantity))}</span>
            <span class="${material.state === 'known' && (material.missing ?? 0) === 0 ? 'enough' : ''}">${material.state === 'known' ? escapeHtml(formatNumber(material.missing ?? 0)) : '?'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="prerequisites">
        <h4>Prerequisite evidence</h4>
        ${card.prerequisiteEvidence.map((evidence) => `
          <div class="evidence-row">
            <span>${escapeHtml(evidence.label)}</span>
            <strong class="${evidence.state === 'unknown' ? 'unknown' : evidence.satisfied ? 'enough' : 'missing'}">${evidence.state === 'unknown' ? 'unknown' : evidence.satisfied ? 'yes' : 'no'}${evidence.value ? ` · ${escapeHtml(evidence.value)}` : ''}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderCompactChild(card: DashboardCard): string {
  return `
    <div class="child-row">
      <button type="button" data-detail="${escapeAttribute(card.key)}"><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.subtitle)}</span></button>
      <a href="${escapeAttribute(card.wikiUrl)}" target="_blank" rel="noopener noreferrer">Wiki ↗</a>
    </div>
  `;
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

function qualityRow(label: string, quality: 'known' | 'partial' | 'unknown'): string {
  return `<div class="quality-row"><span>${escapeHtml(label)}</span>${qualityChip(quality)}</div>`;
}

function isPlannerCard(card: DashboardCard): card is PlannerCard {
  return card.kind === 'eternal' || card.kind === 'evoker';
}

function sectionLabel(value: DashboardSection): string {
  return NAV_ITEMS.find(([key]) => key === value)?.[1] ?? value;
}

function sectionDescription(value: DashboardSection): string {
  switch (value) {
    case 'overview': return 'Snapshot coverage and planner readiness at a glance.';
    case 'eternals': return 'Observed Eternal state and the final 5★ character uncap recipe; the preceding weapon/Fate unlock path remains explicit unknown evidence.';
    case 'evokers': return 'Observed Evoker state and the final 5★ character uncap recipe with unsupported prerequisites kept explicit unknown.';
    case 'characters': return 'Character instances observed in the passive scan.';
    case 'weapons': return 'Primary weapon inventory. Filtered scans remain marked partial.';
    case 'summons': return 'Summon instances observed in the passive scan.';
    case 'treasures': return 'Treasure and material quantities returned by GBF.';
    case 'consumables': return 'Consumables, tickets and other item groups kept separate by technical context.';
    case 'stashes': return 'Observed weapon containers kept separate from the primary weapon inventory.';
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
