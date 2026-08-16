import './detail-wiki.css';
import {
  renderWikiDetailGameplay,
  unavailableWikiDetailText,
  type WikiDetailKind,
} from './detail-wiki.ts';
import {
  loadWikiGameplayFamily,
  type WikiGameplayFamily,
  type WikiGameplayMetadataIndex,
} from './wiki-gameplay-metadata.ts';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadataIndex,
} from './wiki-metadata.ts';

let installed = false;
const metadataPromises = new Map<WikiDetailKind, Promise<{
  gameplay: WikiGameplayMetadataIndex;
  entities: EntityMetadataIndex;
}>>();

export function installWikiDetailEnhancement(): void {
  if (installed || typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;
  installed = true;

  const observer = new MutationObserver(() => enhanceCurrentDetail(app));
  observer.observe(app, { childList: true, subtree: true });
  enhanceCurrentDetail(app);
}

function enhanceCurrentDetail(app: HTMLElement): void {
  const panel = app.querySelector<HTMLElement>('.detail-panel');
  if (!panel || panel.dataset.wikiGameplayEnhanced === 'true') return;

  const kind = detailKind(panel);
  if (!kind) return;
  panel.dataset.wikiGameplayEnhanced = 'true';

  const factsSection = observedFactsSection(panel);
  const masterId = factsSection ? factValue(factsSection, 'Master ID') : undefined;
  const uncap = factsSection ? numericFact(factValue(factsSection, 'Uncap')) : undefined;

  const gameplaySection = document.createElement('section');
  gameplaySection.className = 'detail-section wiki-gameplay-section';
  gameplaySection.dataset.wikiGameplay = kind.toLowerCase();
  gameplaySection.innerHTML = '<div class="wiki-gameplay-loading">Loading public Wiki gameplay details…</div>';

  const actions = panel.querySelector<HTMLElement>('.detail-actions');
  if (actions) actions.insertAdjacentElement('afterend', gameplaySection);
  else panel.prepend(gameplaySection);

  if (factsSection) moveObservedFactsToDisclosure(panel, factsSection);

  if (!masterId) {
    gameplaySection.innerHTML = unavailableWikiDetailText('Wiki gameplay details');
    return;
  }

  void loadDetailMetadata(kind).then(({ gameplay, entities }) => {
    if (!gameplaySection.isConnected) return;
    gameplaySection.innerHTML = renderWikiDetailGameplay(kind, masterId, uncap, gameplay, entities);
  }).catch(() => {
    if (!gameplaySection.isConnected) return;
    gameplaySection.innerHTML = unavailableWikiDetailText('Wiki gameplay details');
  });
}

function moveObservedFactsToDisclosure(panel: HTMLElement, factsSection: HTMLElement): void {
  const facts = factsSection.querySelector<HTMLElement>('.facts');
  if (!facts) return;

  const disclosure = document.createElement('details');
  disclosure.className = 'detail-section observed-facts-disclosure';
  disclosure.dataset.observedFacts = 'collapsed';

  const summary = document.createElement('summary');
  const title = document.createElement('strong');
  title.textContent = 'Observed facts';
  const hint = document.createElement('span');
  hint.textContent = 'Technical account fields';
  summary.append(title, hint);

  disclosure.append(summary, facts);
  factsSection.remove();
  panel.append(disclosure);
}

function observedFactsSection(panel: HTMLElement): HTMLElement | undefined {
  return [...panel.querySelectorAll<HTMLElement>('.detail-section')].find(
    (section) => section.querySelector<HTMLElement>('h4')?.textContent?.trim() === 'Observed facts',
  );
}

function factValue(section: HTMLElement, label: string): string | undefined {
  for (const row of section.querySelectorAll<HTMLElement>('.facts > div')) {
    if (row.querySelector<HTMLElement>('dt')?.textContent?.trim() !== label) continue;
    const value = row.querySelector<HTMLElement>('dd')?.childNodes[0]?.textContent?.trim();
    return value && value !== 'unknown' && value !== 'unavailable' ? value : undefined;
  }
  return undefined;
}

function numericFact(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function detailKind(panel: HTMLElement): WikiDetailKind | undefined {
  const kind = panel.querySelector<HTMLElement>('.detail-title .eyebrow')?.textContent?.trim();
  return kind === 'CHARACTER' || kind === 'WEAPON' || kind === 'SUMMON' ? kind : undefined;
}

function detailFamily(kind: WikiDetailKind): WikiGameplayFamily {
  if (kind === 'CHARACTER') return 'characters';
  if (kind === 'WEAPON') return 'weapons';
  return 'summons';
}

function loadDetailMetadata(kind: WikiDetailKind): Promise<{
  gameplay: WikiGameplayMetadataIndex;
  entities: EntityMetadataIndex;
}> {
  const existing = metadataPromises.get(kind);
  if (existing) return existing;

  const entities = kind === 'WEAPON'
    ? loadWikiEntityMetadata().catch(() => EMPTY_ENTITY_METADATA)
    : Promise.resolve(EMPTY_ENTITY_METADATA);
  const pending = Promise.all([
    loadWikiGameplayFamily(detailFamily(kind)),
    entities,
  ]).then(([gameplay, entityMetadata]) => ({ gameplay, entities: entityMetadata })).catch((error) => {
    metadataPromises.delete(kind);
    throw error;
  });
  metadataPromises.set(kind, pending);
  return pending;
}
