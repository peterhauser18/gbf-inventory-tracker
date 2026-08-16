import './collection-tracker.css';
import { loadAccountDatabase } from '../account/storage.ts';
import {
  buildCollectionTrackerExport,
  loadWikiCharacterMasterIds,
  type CollectionTrackerExport,
  type CollectionTrackerOmission,
} from './collection-tracker.ts';
import type { DataQuality } from '../types/account.ts';

interface PreparedExport {
  result: CollectionTrackerExport;
  rosterQuality: DataQuality;
}

const app = document.querySelector<HTMLElement>('#dashboard-app');
let preparedExport: Promise<PreparedExport> | null = null;

if (app) {
  const observer = new MutationObserver(syncPanel);
  observer.observe(app, { childList: true, subtree: true });
  syncPanel();
}

function syncPanel(): void {
  if (!app) return;
  const charactersActive = app.querySelector('.nav-item.active[data-section="characters"]');
  if (!charactersActive) return;
  if (app.querySelector('[data-collection-tracker-panel]')) return;

  const header = app.querySelector<HTMLElement>('.content .content-header');
  if (!header) return;

  const panel = document.createElement('section');
  panel.className = 'collection-export-panel';
  panel.dataset.collectionTrackerPanel = 'true';
  panel.innerHTML = `
    <div>
      <p class="eyebrow">COLLECTION EXPORT</p>
      <h3>GBF Wiki Collection Tracker</h3>
      <p class="muted">Generate a tracker link locally from the cumulative account database. Nothing is uploaded automatically.</p>
    </div>
    <div class="collection-export-state" data-collection-export-state>
      <span class="collection-export-spinner" aria-hidden="true"></span>
      <span>Checking the public GBF Wiki character dataset…</span>
    </div>
  `;
  header.insertAdjacentElement('afterend', panel);
  void renderPreparedExport(panel);
}

async function renderPreparedExport(panel: HTMLElement): Promise<void> {
  try {
    preparedExport ??= prepareExport();
    const prepared = await preparedExport;
    if (!panel.isConnected) return;
    panel.innerHTML = renderReadyPanel(prepared);
    bindCopy(panel, prepared.result.url);
  } catch (error) {
    if (!panel.isConnected) return;
    panel.innerHTML = `
      <div>
        <p class="eyebrow">COLLECTION EXPORT</p>
        <h3>GBF Wiki Collection Tracker</h3>
        <p class="muted">The export could not be prepared safely.</p>
      </div>
      <div class="notice"><strong>Unavailable</strong><span>${escapeHtml(error instanceof Error ? error.message : String(error))}</span></div>
    `;
  }
}

async function prepareExport(): Promise<PreparedExport> {
  const [account, knownWikiMasterIds] = await Promise.all([
    loadAccountDatabase(),
    loadWikiCharacterMasterIds(),
  ]);
  if (!account) throw new Error('No cumulative local account data is available yet.');
  return {
    result: buildCollectionTrackerExport(account.snapshot.characters, knownWikiMasterIds),
    rosterQuality: account.snapshot.quality.characters,
  };
}

function renderReadyPanel(prepared: PreparedExport): string {
  const { result, rosterQuality } = prepared;
  const incompleteRoster = rosterQuality !== 'known';
  const summary = result.omitted.length === 0
    ? `${result.includedMasterIds.length} observed characters encoded.`
    : `${result.includedMasterIds.length} encoded; ${result.omitted.length} omitted because they could not be represented without guessing.`;
  const coverage = incompleteRoster
    ? `Roster coverage is ${rosterQuality}; this link contains only observed characters and must not be treated as a complete collection.`
    : 'Roster coverage is known in the cumulative local account database.';

  return `
    <div>
      <p class="eyebrow">COLLECTION EXPORT</p>
      <h3>GBF Wiki Collection Tracker</h3>
      <p class="muted">${escapeHtml(summary)} ${escapeHtml(coverage)}</p>
    </div>
    <div class="collection-export-actions">
      <a class="external-button" href="${escapeAttribute(result.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Open in GBF Wiki ↗</a>
      <button class="external-button collection-copy-button" type="button" data-copy-collection-link>Copy tracker link</button>
    </div>
    <div class="collection-export-state ${incompleteRoster || result.omitted.length ? 'warning' : 'ready'}" data-collection-export-state>
      <strong>${escapeHtml(incompleteRoster || result.omitted.length ? 'Partial export' : 'Ready')}</strong>
      <span>${escapeHtml(summary)}</span>
    </div>
    ${renderOmissions(result.omitted)}
  `;
}

function renderOmissions(omitted: readonly CollectionTrackerOmission[]): string {
  if (omitted.length === 0) return '';
  return `
    <details class="collection-export-omissions">
      <summary>${omitted.length} omitted character${omitted.length === 1 ? '' : 's'}</summary>
      <ul>
        ${omitted.map((entry) => `<li><code>${escapeHtml(entry.masterId)}</code> — ${escapeHtml(omissionLabel(entry.reason))}</li>`).join('')}
      </ul>
    </details>
  `;
}

function bindCopy(panel: HTMLElement, url: string): void {
  panel.querySelector<HTMLButtonElement>('[data-copy-collection-link]')?.addEventListener('click', async () => {
    const state = panel.querySelector<HTMLElement>('[data-collection-export-state]');
    try {
      await navigator.clipboard.writeText(url);
      if (state) state.innerHTML = '<strong>Copied</strong><span>Tracker link copied to the clipboard.</span>';
    } catch {
      if (state) state.innerHTML = '<strong>Copy failed</strong><span>Your browser did not allow clipboard access. Use “Open in GBF Wiki” and copy the URL from the address bar.</span>';
    }
  });
}

function omissionLabel(reason: CollectionTrackerOmission['reason']): string {
  switch (reason) {
    case 'unsupported-master-id': return 'technical ID is outside the current tracker encoding';
    case 'unknown-uncap': return 'uncap state is unknown';
    case 'unsupported-uncap': return 'uncap state is outside the current 3-bit tracker range';
    case 'not-in-wiki-dataset': return 'not present in the current public wiki character dataset';
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
