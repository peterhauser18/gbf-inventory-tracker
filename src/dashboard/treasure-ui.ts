import { loadAccountDatabase } from '../account/storage.ts';
import type { TreasureCount } from '../types/account.ts';
import { resolveWikiUrl } from './resolver.ts';
import './treasure-ui.css';

const PAGE_SIZE = 100;
const app = document.querySelector<HTMLElement>('#dashboard-app');
let query = '';
let page = 0;
let treasures: TreasureCount[] = [];

window.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.nav-item[data-section="treasures"]');
  if (!button || !app) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void openTreasureView(button);
}, true);

async function openTreasureView(button: HTMLButtonElement): Promise<void> {
  for (const item of app?.querySelectorAll<HTMLElement>('.nav-item.active') ?? []) item.classList.remove('active');
  button.classList.add('active');

  const content = app?.querySelector<HTMLElement>('.content');
  if (!content) return;
  content.innerHTML = loadingMarkup();

  try {
    const account = await loadAccountDatabase();
    if (!account) {
      content.innerHTML = emptyMarkup('No treasure data observed yet.');
      return;
    }
    treasures = account.snapshot.treasures;
    query = '';
    page = 0;
    render(content);
  } catch (error) {
    content.innerHTML = emptyMarkup(error instanceof Error ? error.message : String(error));
  }
}

function render(content: HTMLElement): void {
  const filtered = filteredTreasures();
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, pageCount - 1);
  const start = page * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  content.innerHTML = `
    <header class="content-header treasure-header">
      <div>
        <p class="eyebrow">INVENTORY</p>
        <h2>Treasures</h2>
        <p class="muted">Full local treasure inventory. Rendering is paged so large inventories stay responsive.</p>
      </div>
      <label class="search">
        <span>Filter treasures</span>
        <input data-treasure-search type="search" value="${escapeAttribute(query)}" placeholder="Name or technical ID" autocomplete="off" />
      </label>
    </header>
    <div class="treasure-page-bar">
      <span>${escapeHtml(resultLabel(filtered.length, start, visible.length))}</span>
      <span>Page ${page + 1} / ${pageCount}</span>
    </div>
    ${visible.length === 0 ? '<div class="empty"><strong>No matching treasures</strong><span>Try a different name or technical ID.</span></div>' : `
      <section class="treasure-grid">
        ${visible.map(renderTreasure).join('')}
      </section>
    `}
    <div class="treasure-pagination" aria-label="Treasure pages">
      <button type="button" data-treasure-page="previous" ${page === 0 ? 'disabled' : ''}>Previous</button>
      <button type="button" data-treasure-page="next" ${page >= pageCount - 1 ? 'disabled' : ''}>Next</button>
    </div>
  `;

  content.querySelector<HTMLInputElement>('[data-treasure-search]')?.addEventListener('input', (event) => {
    query = (event.currentTarget as HTMLInputElement).value;
    page = 0;
    render(content);
    const input = content.querySelector<HTMLInputElement>('[data-treasure-search]');
    input?.focus();
    input?.setSelectionRange(query.length, query.length);
  });
  content.querySelector<HTMLButtonElement>('[data-treasure-page="previous"]')?.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    render(content);
  });
  content.querySelector<HTMLButtonElement>('[data-treasure-page="next"]')?.addEventListener('click', () => {
    page += 1;
    render(content);
  });
}

function filteredTreasures(): TreasureCount[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return treasures;
  return treasures.filter((treasure) =>
    treasure.itemId.toLowerCase().includes(normalized) ||
    treasure.name?.toLowerCase().includes(normalized),
  );
}

function renderTreasure(treasure: TreasureCount): string {
  const name = treasure.name ?? `Treasure ${treasure.itemId}`;
  const wikiUrl = resolveWikiUrl({ displayName: treasure.name, publicId: treasure.itemId });
  return `
    <article class="treasure-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span class="muted">ID ${escapeHtml(treasure.itemId)}</span>
      </div>
      <div class="treasure-owned">
        <span>Owned</span>
        <strong>${escapeHtml(formatNumber(treasure.quantity))}</strong>
      </div>
      <a href="${escapeAttribute(wikiUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Wiki ↗</a>
    </article>
  `;
}

function loadingMarkup(): string {
  return '<div class="standalone"><p class="eyebrow">INVENTORY</p><h1>Treasures</h1><p class="muted">Loading local treasure inventory…</p></div>';
}

function emptyMarkup(detail: string): string {
  return `<div class="standalone"><p class="eyebrow">INVENTORY</p><h1>Treasures unavailable</h1><p class="muted">${escapeHtml(detail)}</p></div>`;
}

function resultLabel(total: number, start: number, visible: number): string {
  if (total === 0) return '0 matches';
  return `Showing ${formatNumber(start + 1)}–${formatNumber(start + visible)} of ${formatNumber(total)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
