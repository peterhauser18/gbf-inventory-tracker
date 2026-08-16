import './combat-compare.css';
import { getRaidHistory } from './storage.ts';
import { buildRaidHistoryComparison, type RaidHistoryComparison, type RaidComparisonMetric } from './comparison.ts';
import type { RaidHistoryRecord } from './types.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
let history: RaidHistoryRecord[] = [];
let selectedIds: string[] = [];
let syncQueued = false;
let refreshPromise: Promise<void> | null = null;

if (app) {
  app.addEventListener('click', handleClick, true);
  const observer = new MutationObserver(scheduleSync);
  observer.observe(app, { childList: true, subtree: true });
  scheduleSync();
}

function handleClick(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-raid-compare]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const localId = button.dataset.raidCompare;
  if (localId) void toggleSelection(localId);
}

async function toggleSelection(localId: string): Promise<void> {
  await refreshHistory();
  const record = history.find((raid) => raid.localId === localId);
  if (!record) return;
  if (selectedIds.includes(localId)) {
    selectedIds = selectedIds.filter((id) => id !== localId);
    scheduleSync();
    return;
  }
  const first = selectedIds[0] ? history.find((raid) => raid.localId === selectedIds[0]) : undefined;
  if (!first || first.raidTechnicalId !== record.raidTechnicalId) selectedIds = [localId];
  else if (selectedIds.length === 1) selectedIds = [selectedIds[0]!, localId];
  else selectedIds = [selectedIds[0]!, localId];
  scheduleSync();
}

async function refreshHistory(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = getRaidHistory()
    .then((rows) => { history = rows; selectedIds = selectedIds.filter((id) => rows.some((raid) => raid.localId === id)); })
    .catch(() => { history = []; selectedIds = []; })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function scheduleSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncUi();
  });
}

function syncUi(): void {
  if (!app) return;
  const raidsActive = Boolean(app.querySelector('.nav-item.active[data-section="raids"]'));
  const section = app.querySelector<HTMLElement>('[data-combat-section]');
  if (!raidsActive || !section) return;

  section.querySelectorAll<HTMLElement>('.raid-card').forEach((card) => {
    const actions = card.querySelector<HTMLElement>('.raid-actions');
    const localId = card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport;
    if (!actions || !localId) return;
    let button = actions.querySelector<HTMLButtonElement>('[data-raid-compare]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.raidCompare = localId;
      button.className = 'raid-compare-button';
      actions.prepend(button);
    }
    const selected = selectedIds.includes(localId);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.textContent = selected ? '✓ Compare' : 'Compare';
  });

  syncComparisonPanel(section);
}

function syncComparisonPanel(section: HTMLElement): void {
  let panel = section.querySelector<HTMLElement>('[data-raid-comparison]');
  if (selectedIds.length === 0) {
    panel?.remove();
    return;
  }
  if (!panel) {
    panel = document.createElement('section');
    panel.dataset.raidComparison = 'true';
    panel.className = 'raid-comparison';
    const toolbar = section.querySelector('.raid-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('afterend', panel);
    else section.prepend(panel);
  }

  const selected = selectedIds.map((id) => history.find((raid) => raid.localId === id)).filter((raid): raid is RaidHistoryRecord => Boolean(raid));
  const markup = selected.length < 2
    ? renderComparePrompt(selected[0])
    : renderComparison(buildRaidHistoryComparison(selected[0]!, selected[1]!));
  if (panel.innerHTML !== markup) panel.innerHTML = markup;
}

function renderComparePrompt(record: RaidHistoryRecord | undefined): string {
  return `<div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>${escapeHtml(record?.raidName ?? record?.raidTechnicalId ?? 'Selected raid')}</h3></div><span class="quality partial">1 / 2</span></div><p class="muted">Select one more record with the same technical raid ID. Comparison uses only already-persisted observed combat facts.</p>`;
}

function renderComparison(comparison: RaidHistoryComparison | null): string {
  if (!comparison) return '<div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>Comparison unavailable</h3></div></div><p class="muted">Direct comparison requires the same technical raid ID.</p>';
  return `
    <div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>${escapeHtml(comparison.raidName ?? comparison.raidTechnicalId)}</h3><p class="muted">A vs B · Δ is B − A</p></div><span class="quality ${comparison.contributors.quality}">${comparison.contributors.quality}</span></div>
    <div class="raid-compare-metrics"><div class="raid-compare-row head"><span>Metric</span><span>A</span><span>B</span><span>Δ</span></div>${comparison.metrics.map(renderMetric).join('')}</div>
    <div class="raid-contributor-compare">
      <div><span>Observed in both</span><strong>${renderContributorList(comparison.contributors.common)}</strong></div>
      <div><span>Observed only in A</span><strong>${renderContributorList(comparison.contributors.leftOnly)}</strong></div>
      <div><span>Observed only in B</span><strong>${renderContributorList(comparison.contributors.rightOnly)}</strong></div>
    </div>
    <p class="raid-compare-warning">Observed contributors are not guaranteed to be the complete party. Missing attribution remains partial/unknown rather than becoming an absent team member.</p>
  `;
}

function renderMetric(metric: RaidComparisonMetric): string {
  return `<div class="raid-compare-row"><strong>${escapeHtml(metric.label)}</strong><span>${formatMetric(metric.left, metric)}</span><span>${formatMetric(metric.right, metric)}</span><span>${metric.delta === undefined ? '—' : formatSigned(metric.delta, metric)}</span></div>`;
}

function formatMetric(value: number | undefined, metric: RaidComparisonMetric): string {
  if (value === undefined) return '—';
  if (metric.unit === 'ms') return `${(value / 1000).toFixed(1)}s`;
  return metric.precision === undefined ? Math.round(value).toLocaleString('en-US') : value.toFixed(metric.precision);
}
function formatSigned(value: number, metric: RaidComparisonMetric): string {
  const sign = value > 0 ? '+' : '';
  if (metric.unit === 'ms') return `${sign}${(value / 1000).toFixed(1)}s`;
  return `${sign}${metric.precision === undefined ? Math.round(value).toLocaleString('en-US') : value.toFixed(metric.precision)}`;
}
function renderContributorList(rows: RaidHistoryComparison['contributors']['common']): string { return rows.length ? rows.map((row) => escapeHtml(row.label)).join(', ') : '—'; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
