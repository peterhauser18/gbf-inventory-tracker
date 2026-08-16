import './detail-wiki.css';
import {
  loadWikiGameplayMetadata,
  normalizeWikiTitle,
  selectSummonGameplay,
  type WikiAbilityText,
  type WikiGameplayMetadataIndex,
} from './wiki-gameplay-metadata.ts';
import {
  loadWikiEntityMetadata,
  type EntityMetadataIndex,
} from './wiki-metadata.ts';

export type WikiDetailKind = 'CHARACTER' | 'WEAPON' | 'SUMMON';

let installed = false;
let metadataPromise: Promise<{ gameplay: WikiGameplayMetadataIndex; entities: EntityMetadataIndex }> | null = null;

export function installWikiDetailEnhancement(): void {
  if (installed || typeof document === 'undefined') return;
  const app = document.querySelector<HTMLElement>('#dashboard-app');
  if (!app) return;
  installed = true;

  const observer = new MutationObserver(() => enhanceCurrentDetail(app));
  observer.observe(app, { childList: true, subtree: true });
  enhanceCurrentDetail(app);
}

export function renderWikiDetailGameplay(
  kind: WikiDetailKind,
  masterId: string,
  uncap: number | undefined,
  gameplay: WikiGameplayMetadataIndex,
  entities: EntityMetadataIndex,
): string {
  if (kind === 'CHARACTER') {
    return renderAbilitySection('Skills', gameplay.charactersById.get(masterId) ?? [], 'active skill');
  }

  if (kind === 'WEAPON') {
    const title = entities.weapons.get(masterId)?.wikiTitle;
    const abilities = title ? gameplay.weaponsByTitle.get(normalizeWikiTitle(title)) ?? [] : [];
    return renderAbilitySection('Weapon skills', abilities, 'weapon skill');
  }

  const summon = selectSummonGameplay(gameplay.summonsById.get(masterId), uncap);
  return `
    <div class="wiki-gameplay-group">
      <h4>Call</h4>
      ${summon.call ? renderAbility(summon.call) : unavailableText('Call')}
    </div>
    <div class="wiki-gameplay-group">
      <h4>Aura</h4>
      ${summon.aura ? renderAbility(summon.aura) : unavailableText('Aura')}
    </div>
  `;
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
    gameplaySection.innerHTML = unavailableText('Wiki gameplay details');
    return;
  }

  void loadDetailMetadata().then(({ gameplay, entities }) => {
    if (!gameplaySection.isConnected) return;
    gameplaySection.innerHTML = renderWikiDetailGameplay(kind, masterId, uncap, gameplay, entities);
  }).catch(() => {
    if (!gameplaySection.isConnected) return;
    gameplaySection.innerHTML = unavailableText('Wiki gameplay details');
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

function loadDetailMetadata(): Promise<{ gameplay: WikiGameplayMetadataIndex; entities: EntityMetadataIndex }> {
  if (!metadataPromise) {
    metadataPromise = Promise.all([
      loadWikiGameplayMetadata(),
      loadWikiEntityMetadata(),
    ]).then(([gameplay, entities]) => ({ gameplay, entities })).catch((error) => {
      metadataPromise = null;
      throw error;
    });
  }
  return metadataPromise;
}

function renderAbilitySection(heading: string, abilities: readonly WikiAbilityText[], noun: string): string {
  if (abilities.length === 0) {
    return `
      <div class="wiki-gameplay-group">
        <h4>${escapeHtml(heading)}</h4>
        ${unavailableText(heading)}
      </div>
    `;
  }
  return `
    <div class="wiki-gameplay-group">
      <h4>${escapeHtml(heading)}</h4>
      <div class="wiki-ability-list" aria-label="${escapeAttribute(heading)}">
        ${abilities.map(renderAbility).join('')}
      </div>
      <span class="wiki-source-note">Public GBF Wiki ${escapeHtml(noun)} text</span>
    </div>
  `;
}

function renderAbility(ability: WikiAbilityText): string {
  return `
    <article class="wiki-ability">
      <strong>${escapeHtml(ability.name)}</strong>
      <p>${escapeHtml(ability.description)}</p>
    </article>
  `;
}

function unavailableText(label: string): string {
  return `<p class="wiki-gameplay-unavailable">${escapeHtml(label)} unavailable from current public Wiki metadata.</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
