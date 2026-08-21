import './combat-compare.css';
import { getRaidHistory } from './storage.ts';
import {
  buildRaidHistoryComparison,
  type RaidComparisonLoadoutSummary,
  type RaidComparisonRunSummary,
  type RaidHistoryComparison,
  type RaidComparisonMetric,
} from './comparison.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import type { RaidHistoryRecord } from './types.ts';

type ComparableRaidHistoryRecord = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

const app = document.querySelector<HTMLElement>('#dashboard-app');
let history: ComparableRaidHistoryRecord[] = [];
let selectedIds: string[] = [];
let syncQueued = false;
let refreshPromise: Promise<void> | null = null;

if (app) {
  app.addEventListener('click', handleClick, true);
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(requiresRaidComparisonSync)) scheduleSync();
  });
  observer.observe(app, { childList: true, subtree: true });
  scheduleSync();
}

function handleClick(event: MouseEvent): void {
  const clear = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-raid-compare-clear]');
  if (clear) {
    event.preventDefault();
    event.stopImmediatePropagation();
    selectedIds = [];
    scheduleSync();
    return;
  }
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
    const selectionIndex = selectedIds.indexOf(localId);
    const selected = selectionIndex >= 0;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const label = selected ? `✓ ${selectionIndex === 0 ? 'A' : 'B'}` : 'Compare';
    if (button.textContent !== label) button.textContent = label;
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
    const list = section.querySelector('.raid-list');
    if (list) list.insertAdjacentElement('beforebegin', panel);
    else section.prepend(panel);
  }

  const selected = selectedIds.map((id) => history.find((raid) => raid.localId === id)).filter((raid): raid is ComparableRaidHistoryRecord => Boolean(raid));
  const markup = selected.length < 2
    ? renderComparePrompt(selected[0])
    : renderComparison(buildRaidHistoryComparison(selected[0]!, selected[1]!));
  const selectionKey = selected.map((raid) => raid.localId).join('|');
  if (panel.dataset.raidComparisonKey !== selectionKey) {
    panel.dataset.raidComparisonKey = selectionKey;
    panel.innerHTML = markup;
  }
}

function renderComparePrompt(record: RaidHistoryRecord | undefined): string {
  const observedAt = record ? formatDate(record.observedEndedAt ?? record.lastObservedAt) : '—';
  return `<div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>${escapeHtml(record?.raidName ?? record?.raidTechnicalId ?? 'Selected raid')}</h3><p class="muted">A · ${escapeHtml(observedAt)}</p></div><div class="raid-compare-head-actions"><span class="quality partial">1 / 2</span><button type="button" data-raid-compare-clear>Clear</button></div></div><p class="muted">Select one more record with the same technical raid ID. Comparison uses only already-persisted observed combat facts.</p>`;
}

function requiresRaidComparisonSync(mutation: MutationRecord): boolean {
  for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
    if (!(node instanceof Element)) continue;
    if (node.matches('[data-combat-section], .raid-list, .raid-card')) return true;
    if (node.querySelector('[data-combat-section], .raid-list, .raid-card')) return true;
  }
  return false;
}

function renderComparison(comparison: RaidHistoryComparison | null): string {
  if (!comparison) return '<div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>Comparison unavailable</h3></div></div><p class="muted">Direct comparison requires the same technical raid ID.</p>';
  return `
    <div class="raid-compare-head"><div><p class="eyebrow">COMBAT HISTORY COMPARE</p><h3>${escapeHtml(comparison.raidName ?? comparison.raidTechnicalId)}</h3><p class="muted">A vs B · Δ is B − A</p></div><div class="raid-compare-head-actions">${qualityChip(comparison.damageQuality)}<button type="button" data-raid-compare-clear>Clear</button></div></div>
    <div class="raid-compare-runs">${renderRun('A', comparison.runs.left)}${renderRun('B', comparison.runs.right)}</div>
    <div class="raid-compare-metrics"><div class="raid-compare-row head"><span>Metric</span><span class="raid-compare-col-a">A</span><span class="raid-compare-col-b">B</span><span>Δ</span></div>${comparison.metrics.map(renderMetric).join('')}</div>
  `;
}

function renderRun(label: 'A' | 'B', run: RaidComparisonRunSummary): string {
  const loadout = run.loadout ? renderLoadout(run.loadout) : '<p class="muted">Historical loadout unavailable.</p>';
  return `<article class="raid-compare-run side-${label.toLowerCase()}"><div class="raid-compare-run-head"><span>${label}</span><div><strong>${escapeHtml(formatDate(run.observedAt))}</strong><small>${escapeHtml([run.result, run.role, run.source].filter(Boolean).join(' · '))}</small></div></div>${loadout}</article>`;
}

function renderLoadout(loadout: RaidComparisonLoadoutSummary): string {
  const partyLabel = loadout.deckId ? `Party slot ${loadout.deckId}` : 'Party slot unavailable';
  return `<div class="raid-compare-loadout">
    ${renderEvidence(partyLabel, loadout.party, loadout.partyQuality)}
    ${renderEvidence('Summons', loadout.summons, loadout.summonQuality)}
  </div>`;
}

function renderEvidence(label: string, values: string[], quality: 'known' | 'partial' | 'unknown'): string {
  const text = values.map(escapeHtml).join(' · ');
  const qualityText = qualityLabel(quality);
  return `<div><span>${escapeHtml(label)}${qualityText ? ` · ${qualityText}` : ''}</span><strong>${text || 'Unavailable'}</strong></div>`;
}

function qualityLabel(quality: 'known' | 'partial' | 'unknown'): string {
  if (quality === 'known') return '';
  return quality === 'partial' ? 'Incomplete' : 'Unavailable';
}

function qualityChip(quality: 'known' | 'partial' | 'unknown'): string {
  if (quality === 'known') return '';
  const label = quality === 'partial' ? 'Incomplete' : 'Unavailable';
  return `<span class="quality ${quality}">${label}</span>`;
}

function renderMetric(metric: RaidComparisonMetric): string {
  const [leftComparison, rightComparison] = comparisonClasses(metric.left, metric.right);
  return `<div class="raid-compare-row"><strong>${escapeHtml(metric.label)}</strong><span class="raid-compare-col-a${leftComparison}">${formatMetric(metric.left, metric)}</span><span class="raid-compare-col-b${rightComparison}">${formatMetric(metric.right, metric)}</span><span>${metric.delta === undefined ? '—' : formatSigned(metric.delta, metric)}</span></div>`;
}

function comparisonClasses(left: number | undefined, right: number | undefined): [string, string] {
  if (left === undefined || right === undefined || left === right) return ['', ''];
  return left > right
    ? [' raid-compare-higher', ' raid-compare-lower']
    : [' raid-compare-lower', ' raid-compare-higher'];
}

function formatMetric(value: number | undefined, metric: RaidComparisonMetric): string {
  if (value === undefined) return '—';
  return metric.unit === 'ms'
    ? `${(value / 1000).toFixed(1)}s`
    : metric.precision === undefined
      ? Math.round(value).toLocaleString('en-US')
      : value.toFixed(metric.precision);
}
function formatSigned(value: number, metric: RaidComparisonMetric): string {
  const sign = value > 0 ? '+' : '';
  return metric.unit === 'ms'
    ? `${sign}${(value / 1000).toFixed(1)}s`
    : `${sign}${metric.precision === undefined ? Math.round(value).toLocaleString('en-US') : value.toFixed(metric.precision)}`;
}
function formatDate(value: number): string { return new Date(value).toLocaleString(); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
