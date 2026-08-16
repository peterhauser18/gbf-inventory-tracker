import { installWikiDetailEnhancement } from './detail-wiki-ui.ts';
import {
  entityOpenPlan,
  searchDashboardEntities,
  type DashboardEntitySearchResult,
} from './entity-search.ts';
import type { DashboardViewModel } from './model.ts';

let installed = false;
let accountPromise: Promise<{ snapshot: unknown } | null> | null = null;
let modulePromise: Promise<SearchModules> | null = null;
let latestResults = new Map<string, DashboardEntitySearchResult>();

type SearchModules = {
  loadAccountDatabase: () => Promise<{ snapshot: unknown } | null>;
  buildDashboardViewModel: (snapshot: unknown, metadata?: unknown) => DashboardViewModel;
  loadWikiEntityMetadataCached: (
    storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
    fetcher: () => Promise<never>,
  ) => Promise<unknown>;
};

export function installGlobalEntitySearch(): void {
  if (installed || typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;
  installed = true;
  installWikiDetailEnhancement();

  app.addEventListener('click', handleEntityResultClick, true);
  const observer = new MutationObserver(() => syncPalette(app));
  observer.observe(app, { childList: true, subtree: true });
  syncPalette(app);
}

function syncPalette(app: HTMLElement): void {
  const layer = app.querySelector<HTMLElement>('[data-command-layer]');
  const input = layer?.querySelector<HTMLInputElement>('[data-command-search]');
  const resultsRoot = layer?.querySelector<HTMLElement>('.command-results');
  if (!layer || !input || !resultsRoot) return;

  input.placeholder = 'Search dashboard areas, tools and local entities…';
  const query = input.value.trim();
  const existing = resultsRoot.querySelector<HTMLElement>('[data-command-entity-results]');
  if (!query) {
    existing?.remove();
    latestResults.clear();
    return;
  }
  if (existing?.dataset.commandEntityResults === query) return;
  existing?.remove();
  latestResults.clear();

  const placeholder = document.createElement('div');
  placeholder.dataset.commandEntityResults = query;
  resultsRoot.append(placeholder);

  const empty = resultsRoot.querySelector<HTMLElement>('.command-empty');
  if (empty) {
    empty.innerHTML = '<strong>Searching local entities…</strong><span>Results use only local account data and cached public metadata.</span>';
  }

  void loadSearchModel().then((view) => {
    const currentLayer = app.querySelector<HTMLElement>('[data-command-layer]');
    const currentInput = currentLayer?.querySelector<HTMLInputElement>('[data-command-search]');
    const currentRoot = currentLayer?.querySelector<HTMLElement>('.command-results');
    const currentContainer = currentRoot?.querySelector<HTMLElement>('[data-command-entity-results]');
    if (!view || !currentInput || !currentRoot || !currentContainer || currentInput.value.trim() !== query) return;

    const matches = searchDashboardEntities(view, query);
    latestResults = new Map(matches.map((result) => [result.key, result]));
    currentContainer.innerHTML = matches.map(renderEntityResult).join('');

    if (matches.length === 0) {
      const currentEmpty = currentRoot.querySelector<HTMLElement>('.command-empty');
      if (currentEmpty) {
        currentEmpty.innerHTML = '<strong>No local result found</strong><span>Try a dashboard area, entity name or technical/master ID.</span>';
      }
      return;
    }

    currentRoot.querySelector('.command-empty')?.remove();
  }).catch(() => {
    const currentLayer = app.querySelector<HTMLElement>('[data-command-layer]');
    const currentInput = currentLayer?.querySelector<HTMLInputElement>('[data-command-search]');
    const currentRoot = currentLayer?.querySelector<HTMLElement>('.command-results');
    if (!currentInput || !currentRoot || currentInput.value.trim() !== query) return;
    const currentEmpty = currentRoot.querySelector<HTMLElement>('.command-empty');
    if (currentEmpty) {
      currentEmpty.innerHTML = '<strong>No local entity index available</strong><span>Dashboard destinations remain searchable.</span>';
    }
  });
}

function renderEntityResult(result: DashboardEntitySearchResult): string {
  return `
    <button type="button" class="command-result" data-command-entity="${escapeAttribute(result.key)}">
      <span>
        <strong>${escapeHtml(result.title)}</strong>
        <small>${escapeHtml(result.subtitle)}</small>
      </span>
      <span class="command-group">Entity · ${escapeHtml(result.typeLabel)}</span>
    </button>
  `;
}

function handleEntityResultClick(event: Event): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-command-entity]');
  if (!button) return;
  const result = latestResults.get(button.dataset.commandEntity ?? '');
  if (!result) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  openEntityResult(result);
}

function openEntityResult(result: DashboardEntitySearchResult): void {
  const plan = entityOpenPlan(result);
  const navButton = [...document.querySelectorAll<HTMLButtonElement>('.nav-item[data-section]')]
    .find((button) => button.dataset.section === plan.section);
  if (!navButton) return;
  navButton.click();

  for (const detailKey of plan.detailKeys) {
    const stashToggle = [...document.querySelectorAll<HTMLButtonElement>('[data-stash-toggle]')]
      .find((button) => button.dataset.stashToggle === detailKey);
    if (stashToggle) {
      if (stashToggle.getAttribute('aria-expanded') !== 'true') stashToggle.click();
      continue;
    }

    const detailButton = [...document.querySelectorAll<HTMLButtonElement>('[data-detail]')]
      .find((button) => button.dataset.detail === detailKey);
    if (!detailButton) return;
    detailButton.click();
  }
}

async function loadSearchModel(): Promise<DashboardViewModel | null> {
  const modules = await loadSearchModules();
  if (!accountPromise) accountPromise = modules.loadAccountDatabase();
  const account = await accountPromise;
  if (!account) return null;

  let metadata: unknown;
  try {
    metadata = await modules.loadWikiEntityMetadataCached(safeLocalStorage(), noNetworkMetadataFetch);
  } catch {
    metadata = undefined;
  }
  return modules.buildDashboardViewModel(account.snapshot, metadata);
}

function loadSearchModules(): Promise<SearchModules> {
  if (modulePromise) return modulePromise;
  modulePromise = Promise.all([
    import('../account/storage.ts'),
    import('./model.ts'),
    import('./wiki-metadata.ts'),
  ]).then(([storage, modelModule, metadataModule]) => ({
    loadAccountDatabase: storage.loadAccountDatabase as SearchModules['loadAccountDatabase'],
    buildDashboardViewModel: modelModule.buildDashboardViewModel as SearchModules['buildDashboardViewModel'],
    loadWikiEntityMetadataCached: metadataModule.loadWikiEntityMetadataCached as SearchModules['loadWikiEntityMetadataCached'],
  }));
  return modulePromise;
}

async function noNetworkMetadataFetch(): Promise<never> {
  throw new Error('Global entity search uses cached public metadata only.');
}

function safeLocalStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
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
