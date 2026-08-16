import './roster.css';
import { loadAccountDatabase } from '../account/storage.ts';
import type { AccountSnapshot, Element as GbfElement } from '../types/account.ts';
import {
  ROSTER_CAPABILITIES,
  ROSTER_CAPABILITY_LABELS,
  buildRosterCapabilityRows,
  filterRosterCapabilityRows,
  loadWikiRosterCatalog,
  type RosterCapabilityKey,
  type RosterCapabilityRow,
  type WikiRosterCatalog,
} from './roster-capabilities.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
let selected = false;
let snapshot: AccountSnapshot | null = null;
let catalog: WikiRosterCatalog | null = null;
let rows: RosterCapabilityRow[] = [];
let state: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let errorMessage = '';
let query = '';
let element: GbfElement | 'all' = 'all';
let capability: RosterCapabilityKey | 'all' = 'all';
let loadPromise: Promise<void> | null = null;

if (app) {
  app.addEventListener('click', handleClick, true);
  app.addEventListener('input', handleInput, true);
  app.addEventListener('change', handleChange, true);
}

function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  const nav = target?.closest<HTMLButtonElement>('.nav-item[data-section]');
  if (!nav) return;
  if (nav.dataset.section !== 'roster') {
    selected = false;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  selected = true;
  activateRosterNav();
  render();
  void ensureLoaded();
}

function handleInput(event: Event): void {
  if (!selected) return;
  const input = (event.target as Element | null)?.closest<HTMLInputElement>('[data-roster-search]');
  if (!input) return;
  query = input.value;
  render();
  queueMicrotask(() => {
    const next = app?.querySelector<HTMLInputElement>('[data-roster-search]');
    next?.focus();
    next?.setSelectionRange(query.length, query.length);
  });
}

function handleChange(event: Event): void {
  if (!selected) return;
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;
  if (target.matches('[data-roster-element]')) {
    element = parseElementFilter(target.value);
    render();
  }
  if (target.matches('[data-roster-capability]')) {
    capability = parseCapabilityFilter(target.value);
    render();
  }
}

async function ensureLoaded(): Promise<void> {
  if (state === 'ready' || loadPromise) return loadPromise ?? Promise.resolve();
  state = 'loading';
  render();
  loadPromise = (async () => {
    try {
      const [account, wikiCatalog] = await Promise.all([loadAccountDatabase(), loadWikiRosterCatalog()]);
      snapshot = account?.snapshot ?? null;
      catalog = wikiCatalog;
      rows = snapshot ? buildRosterCapabilityRows(snapshot, catalog) : [];
      state = 'ready';
    } catch (error) {
      state = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      loadPromise = null;
      if (selected) render();
    }
  })();
  return loadPromise;
}

function activateRosterNav(): void {
  app?.querySelectorAll<HTMLElement>('.nav-item[data-section]').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === 'roster');
  });
}

function render(): void {
  if (!app || !selected) return;
  activateRosterNav();
  app.querySelectorAll('.detail-backdrop, .detail-panel').forEach((node) => node.remove());
  const content = app.querySelector<HTMLElement>('.content');
  if (!content) return;
  const filtered = filterRosterCapabilityRows(rows, { query, element, capability });

  content.innerHTML = `
    <div class="command-bar">
      <button class="command-trigger" type="button" data-command-trigger aria-haspopup="dialog">
        <span class="command-icon" aria-hidden="true">⌕</span><span>Search or jump to a dashboard area…</span><kbd>Ctrl K</kbd>
      </button>
      <span class="read-only-pill">Read-only</span>
    </div>
    <header class="content-header roster-header">
      <div><p class="eyebrow">ROSTER</p><h2>Capability matrix</h2><p class="muted">Observed local roster joined locally with bulk public GBF Wiki descriptions. Signals describe the character kit; level/condition availability is not inferred. A blank capability is a supported no-signal only when Wiki coverage is complete; otherwise it stays ?.</p></div>
      ${snapshot ? qualityChip(snapshot.quality.characters) : qualityChip('unknown')}
    </header>
    ${renderBody(filtered)}
  `;
}

function renderBody(filtered: readonly RosterCapabilityRow[]): string {
  if (state === 'idle' || state === 'loading') {
    return '<section class="roster-empty"><strong>Loading roster capabilities</strong><span>Reading the local roster and bulk public Wiki metadata…</span></section>';
  }
  if (state === 'error') {
    return `<section class="roster-empty"><strong>Roster capabilities unavailable</strong><span>${escapeHtml(errorMessage || 'Local roster data could not be read.')}</span></section>`;
  }
  if (!snapshot) {
    return '<section class="roster-empty"><strong>No local roster snapshot</strong><span>Roster capabilities remain unavailable until character observations exist locally.</span></section>';
  }

  return `
    <section class="roster-toolbar">
      <label><span>Search</span><input type="search" data-roster-search value="${escapeAttribute(query)}" placeholder="Character, ID, style, race, weapon" autocomplete="off" /></label>
      <label><span>Element</span><select data-roster-element>${elementOptions()}</select></label>
      <label><span>Capability</span><select data-roster-capability>${capabilityOptions()}</select></label>
      ${renderSourceQuality(catalog)}
    </section>
    <section class="roster-summary"><strong>${formatNumber(filtered.length)}</strong><span>of ${formatNumber(rows.length)} observed characters</span></section>
    ${filtered.length ? renderMatrix(filtered) : '<section class="roster-empty"><strong>No matching observed characters</strong><span>Change the local filters; unresolved capability cells are not treated as matches.</span></section>'}
  `;
}

function renderMatrix(filtered: readonly RosterCapabilityRow[]): string {
  return `<div class="roster-matrix-wrap"><div class="roster-matrix" role="table" aria-label="Observed roster capability matrix">
    <div class="roster-row roster-row-head" role="row">
      <span>Character</span><span>Element</span><span>Style</span><span>Race</span><span>Weapon</span>
      ${ROSTER_CAPABILITIES.map((key) => `<span title="${escapeAttribute(ROSTER_CAPABILITY_LABELS[key])}">${escapeHtml(ROSTER_CAPABILITY_LABELS[key])}</span>`).join('')}
    </div>
    ${filtered.map(renderRow).join('')}
  </div></div>`;
}

function renderRow(row: RosterCapabilityRow): string {
  return `<div class="roster-row" role="row">
    <span class="roster-name"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.masterId)}${metadataNote(row.metadataQuality)}</small></span>
    <span>${escapeHtml(row.element ?? '?')}</span>
    <span>${escapeHtml(row.style ?? '?')}</span>
    <span>${escapeHtml(row.races.join(', ') || '?')}</span>
    <span>${escapeHtml(row.weapons.join(', ') || '?')}</span>
    ${ROSTER_CAPABILITIES.map((key) => capabilityCell(row.capabilities[key], ROSTER_CAPABILITY_LABELS[key])).join('')}
  </div>`;
}

function capabilityCell(value: boolean | undefined, label: string): string {
  if (value === true) return `<span class="roster-cap yes" title="Wiki-described ${escapeAttribute(label)} signal">✓</span>`;
  if (value === false) return `<span class="roster-cap no" title="No supported ${escapeAttribute(label)} signal detected in complete current Wiki capability tables">—</span>`;
  return `<span class="roster-cap unknown" title="Wiki capability coverage is incomplete for this conclusion">?</span>`;
}

function renderSourceQuality(value: WikiRosterCatalog | null): string {
  const base = value?.baseQuality ?? 'unknown';
  const capability = value?.capabilityQuality ?? 'unknown';
  const items = [
    base === 'known' ? '' : `<span>Wiki metadata</span>${qualityChip(base)}`,
    capability === 'known' ? '' : `<span>Capability coverage</span>${qualityChip(capability)}`,
  ].filter(Boolean);
  return items.length ? `<div class="roster-source-quality">${items.join('')}</div>` : '';
}

function metadataNote(quality: 'known' | 'partial' | 'unknown'): string {
  if (quality === 'known') return '';
  return quality === 'partial' ? ' · metadata incomplete' : ' · metadata unavailable';
}

function elementOptions(): string {
  const values: Array<GbfElement | 'all'> = ['all', 'fire', 'water', 'earth', 'wind', 'light', 'dark'];
  return values.map((value) => `<option value="${value}"${element === value ? ' selected' : ''}>${value === 'all' ? 'All elements' : capitalize(value)}</option>`).join('');
}

function capabilityOptions(): string {
  return `<option value="all"${capability === 'all' ? ' selected' : ''}>All capabilities</option>${ROSTER_CAPABILITIES.map((key) => `<option value="${key}"${capability === key ? ' selected' : ''}>${escapeHtml(ROSTER_CAPABILITY_LABELS[key])}</option>`).join('')}`;
}

function parseElementFilter(value: string): GbfElement | 'all' {
  return value === 'fire' || value === 'water' || value === 'earth' || value === 'wind' || value === 'light' || value === 'dark' ? value : 'all';
}

function parseCapabilityFilter(value: string): RosterCapabilityKey | 'all' {
  return ROSTER_CAPABILITIES.includes(value as RosterCapabilityKey) ? value as RosterCapabilityKey : 'all';
}

function qualityChip(quality: 'known' | 'partial' | 'unknown'): string {
  if (quality === 'known') return '';
  const label = quality === 'partial' ? 'Incomplete' : 'Unavailable';
  return `<span class="quality ${quality}">${label}</span>`;
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function formatNumber(value: number): string { return new Intl.NumberFormat('en-US').format(value); }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
