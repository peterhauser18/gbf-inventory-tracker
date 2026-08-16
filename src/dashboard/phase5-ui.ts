import './phase5.css';
import { loadAccountDatabase } from '../account/storage.ts';
import {
  analysisDigestFilename,
  buildAnalysisDigest,
  compareAnalysisDigests,
  parseAnalysisDigest,
  serializeAnalysisDigest,
  type AnalysisDigest,
  type AnalysisDigestComparisonRow,
} from './analysis-digest.ts';
import { polishDashboardEmptyState } from './empty-state.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
let importedDigest: AnalysisDigest | null = null;
let currentDigest: AnalysisDigest | null = null;
let importError = '';
let syncQueued = false;
let loadPromise: Promise<void> | null = null;
let snapshotStateRevision = 0;

if (app) {
  app.addEventListener('click', handleClick, true);
  app.addEventListener('change', handleChange, true);
  const observer = new MutationObserver(scheduleSync);
  observer.observe(app, { childList: true, subtree: true });
  scheduleSync();
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
  polishEmptyStates();
  ensureQualityLegend();
  if (!isSettingsActive()) return;
  ensureSnapshotCard();
  void ensureCurrentDigest();
}

function polishEmptyStates(): void {
  app?.querySelectorAll<HTMLElement>('.empty:not([data-phase5-empty-polished])').forEach((empty) => {
    const strong = empty.querySelector<HTMLElement>('strong');
    const detail = empty.querySelector<HTMLElement>('span');
    if (!strong || !detail) return;
    const polished = polishDashboardEmptyState(strong.textContent ?? '', detail.textContent ?? '');
    if (strong.textContent !== polished.title) strong.textContent = polished.title;
    if (detail.textContent !== polished.detail) detail.textContent = polished.detail;
    empty.dataset.phase5EmptyPolished = polished.kind;
  });
}

function ensureQualityLegend(): void {
  const content = app?.querySelector<HTMLElement>('.content');
  const header = content?.querySelector<HTMLElement>('.content-header');
  if (!content || !header || content.querySelector('[data-phase5-quality-legend]')) return;
  const legend = document.createElement('section');
  legend.className = 'quality-legend';
  legend.dataset.phase5QualityLegend = 'true';
  legend.setAttribute('aria-label', 'Data confidence legend');
  legend.innerHTML = `
    <strong>Data confidence</strong>
    ${legendItem('known', 'Complete', 'Complete enough for this conclusion')}
    ${legendItem('partial', 'Incomplete', 'Some evidence observed; avoid full conclusions')}
    ${legendItem('unknown', 'Unavailable', 'Insufficient evidence; never treated as zero')}
  `;
  header.insertAdjacentElement('afterend', legend);
}

function legendItem(quality: 'known' | 'partial' | 'unknown', label: string, detail: string): string {
  return `<span class="quality-legend-item"><span class="quality ${quality}">${label}</span><span>${detail}</span></span>`;
}

function isSettingsActive(): boolean {
  return Boolean(app?.querySelector('.nav-item.active[data-section="settings"]'));
}

async function ensureCurrentDigest(): Promise<void> {
  if (currentDigest || loadPromise) return loadPromise ?? Promise.resolve();
  loadPromise = (async () => {
    const account = await loadAccountDatabase();
    currentDigest = account ? buildAnalysisDigest(account.snapshot, Date.now()) : null;
    snapshotStateRevision += 1;
    if (isSettingsActive()) renderSnapshotCard();
  })().catch((error) => {
    importError = error instanceof Error ? error.message : String(error);
    snapshotStateRevision += 1;
    if (isSettingsActive()) renderSnapshotCard();
  }).finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

function ensureSnapshotCard(): void {
  const grid = app?.querySelector<HTMLElement>('.system-grid');
  if (!grid) return;
  let card = grid.querySelector<HTMLElement>('[data-phase5-snapshot-card]');
  if (!card) {
    card = document.createElement('article');
    card.className = 'system-card system-card-wide phase5-snapshot-card';
    card.dataset.phase5SnapshotCard = 'true';
    grid.append(card);
  }
  renderSnapshotCard();
}

function renderSnapshotCard(): void {
  const card = app?.querySelector<HTMLElement>('[data-phase5-snapshot-card]');
  if (!card) return;
  const revision = String(snapshotStateRevision);
  if (card.dataset.phase5RenderRevision === revision) return;
  const comparison = importedDigest && currentDigest ? compareAnalysisDigests(importedDigest, currentDigest) : null;
  const markup = `
    <div>
      <p class="eyebrow">LOCAL ANALYSIS SNAPSHOT</p>
      <h3>Compare progress without restoring data</h3>
      <p class="muted">Exports contain only capture time, rank summary, family counts and quality states. Import is comparison-only in this tab and never writes account, combat, goal, preference or observation storage.</p>
    </div>
    <div class="phase5-snapshot-actions">
      <button class="phase5-action" type="button" data-phase5-export${currentDigest ? '' : ' disabled'}>Export analysis digest</button>
      <label class="phase5-action">Compare previous digest<input type="file" accept="application/json,.json" data-phase5-import /></label>
      ${importedDigest ? '<button class="phase5-action" type="button" data-phase5-clear>Clear comparison</button>' : ''}
    </div>
    ${importError ? `<div class="phase5-snapshot-error" role="status">${escapeHtml(importError)}</div>` : ''}
    ${comparison ? renderComparison(comparison) : '<p class="muted">Import a previous GBF Tool analysis digest to compare available summary values. No imported data is persisted.</p>'}
  `;
  card.dataset.phase5RenderRevision = revision;
  card.innerHTML = markup;
}

function renderComparison(comparison: ReturnType<typeof compareAnalysisDigests>): string {
  return `
    <div class="phase5-compare-meta">
      <span>Previous: ${escapeHtml(formatDate(comparison.previousCapturedAt))}</span>
      <span>Current: ${escapeHtml(formatDate(comparison.currentCapturedAt))}</span>
      <span>Δ = current − previous</span>
    </div>
    <div class="phase5-compare-table" role="table" aria-label="Analysis snapshot comparison">
      <div class="phase5-compare-row head" role="row"><span>Metric</span><span>Previous</span><span>Current</span><span>Δ</span></div>
      ${comparison.rows.map(renderComparisonRow).join('')}
    </div>
  `;
}

function renderComparisonRow(row: AnalysisDigestComparisonRow): string {
  const known = row.delta !== undefined;
  return `<div class="phase5-compare-row" role="row"><strong>${escapeHtml(row.label)}</strong><span class="${known ? '' : 'unknown'}">${known ? formatNumber(row.previous!) : '—'}</span><span class="${known ? '' : 'unknown'}">${known ? formatNumber(row.current!) : '—'}</span><span class="${known ? '' : 'unknown'}">${known ? formatSigned(row.delta!) : qualityLabel(row.quality)}</span></div>`;
}

function qualityLabel(quality: 'known' | 'partial' | 'unknown'): string {
  if (quality === 'known') return 'Complete';
  if (quality === 'partial') return 'Incomplete';
  return 'Unavailable';
}

function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  if (target?.closest('[data-phase5-export]')) {
    event.preventDefault();
    void exportCurrentDigest();
    return;
  }
  if (target?.closest('[data-phase5-clear]')) {
    importedDigest = null;
    importError = '';
    snapshotStateRevision += 1;
    renderSnapshotCard();
  }
}

function handleChange(event: Event): void {
  const input = (event.target as Element | null)?.closest<HTMLInputElement>('[data-phase5-import]');
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  void importDigest(file).finally(() => { input.value = ''; });
}

async function exportCurrentDigest(): Promise<void> {
  const account = await loadAccountDatabase();
  if (!account) {
    importError = 'No local account snapshot is available to export.';
    snapshotStateRevision += 1;
    renderSnapshotCard();
    return;
  }
  const exportedAt = Date.now();
  currentDigest = buildAnalysisDigest(account.snapshot, exportedAt);
  downloadJson(analysisDigestFilename(exportedAt), serializeAnalysisDigest(currentDigest));
  importError = '';
  snapshotStateRevision += 1;
  renderSnapshotCard();
}

async function importDigest(file: File): Promise<void> {
  try {
    importedDigest = parseAnalysisDigest(await file.text());
    importError = '';
  } catch (error) {
    importedDigest = null;
    importError = error instanceof Error ? error.message : String(error);
  }
  snapshotStateRevision += 1;
  renderSnapshotCard();
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatNumber(value: number): string { return new Intl.NumberFormat('en-US').format(value); }
function formatSigned(value: number): string { return `${value > 0 ? '+' : ''}${formatNumber(value)}`; }
function formatDate(timestamp: number): string { return timestamp > 0 ? new Date(timestamp).toLocaleString() : 'time unavailable'; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
