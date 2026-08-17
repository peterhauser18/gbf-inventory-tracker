import './multi-active-compat.css';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadata,
  type EntityMetadataIndex,
} from '../dashboard/wiki-metadata.ts';
import { renderCombatLayout } from './layouts.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import { getActiveCombatRaids, type ActiveCombatRaid } from './storage.ts';
import { actorVisualImageId } from './visual-context.ts';
import { resolveWikiCombatAssetImage } from './wiki-visuals.ts';

const participantOpenByRaid = new Map<string, boolean>();
const retainedActorByRaid = new Map<string, string>();
const suppressedActorByRaid = new Map<string, string>();
let metadataPromise: Promise<EntityMetadataIndex> | null = null;
let syncQueued = false;
let syncRunning = false;
let syncAgain = false;

export function installCombatMultiActiveCompat(root: HTMLElement): void {
  root.addEventListener('click', (event) => {
    if (handleScopedPartyToggle(root, event)) return;
    handleRetainedActorClick(root, event);
  }, true);
  root.addEventListener('keydown', (event) => handleRetainedActorKeydown(root, event), true);
  const observer = new MutationObserver(() => scheduleSync(root));
  observer.observe(root, { childList: true, subtree: true });
  scheduleSync(root);
}

function scheduleSync(root: HTMLElement): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    void syncCompat(root);
  });
}

async function syncCompat(root: HTMLElement): Promise<void> {
  collapseParticipantsByDefault(root);
  applyScopedSuppression(root);
  if (syncRunning) {
    syncAgain = true;
    return;
  }
  syncRunning = true;
  try {
    const [active, metadata] = await Promise.all([getActiveCombatRaids(), combatMetadata()]);
    const byKey = new Map(active.map((entry) => [entry.key, entry]));
    syncRetainedActorCards(root, byKey, metadata);
    for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
      const key = card.dataset.activeCombatKey;
      const entry = key ? byKey.get(key) : undefined;
      if (entry) await hydrateActiveCardVisuals(card, entry, metadata);
    }
    applyScopedSuppression(root);
  } finally {
    syncRunning = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(root);
    }
  }
}

function collapseParticipantsByDefault(root: HTMLElement): void {
  for (const details of root.querySelectorAll<HTMLDetailsElement>('[data-combat-collapse="participants"]')) {
    const key = activeRaidKey(details);
    if (!participantOpenByRaid.has(key)) participantOpenByRaid.set(key, false);
    const desired = participantOpenByRaid.get(key) ?? false;
    if (details.open !== desired) details.open = desired;
    if (details.dataset.compatParticipantsBound === 'true') continue;
    details.dataset.compatParticipantsBound = 'true';
    details.addEventListener('toggle', () => participantOpenByRaid.set(key, details.open));
  }
}

function handleScopedPartyToggle(root: HTMLElement, event: MouseEvent): boolean {
  const button = (event.target as Element | null)?.closest<HTMLElement>('[data-character-select]');
  if (!button || button.closest('.raid-character-detail')) return false;
  const key = activeRaidKey(button);
  const actorId = button.dataset.characterSelect;
  if (!actorId || key === 'single') return false;

  if (retainedActorByRaid.has(key)) clearRetainedActorSelection(root, key);

  const suppressed = suppressedActorByRaid.get(key);
  if (suppressed && suppressed !== actorId) {
    suppressedActorByRaid.delete(key);
    clearScopedSuppressionArtifacts(root, key);
  }

  if (suppressedActorByRaid.get(key) === actorId) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressedActorByRaid.delete(key);
    revealScopedDetails(root, key, actorId);
    return true;
  }

  if (!button.classList.contains('selected')) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressedActorByRaid.set(key, actorId);
  applyScopedSuppression(root);
  return true;
}

function applyScopedSuppression(root: HTMLElement): void {
  for (const [key, actorId] of suppressedActorByRaid) {
    const card = activeCard(root, key);
    if (!card) continue;
    const buttons = [...card.querySelectorAll<HTMLElement>('[data-character-select]')];
    if (!buttons.some((button) => button.dataset.characterSelect === actorId)) {
      suppressedActorByRaid.delete(key);
      clearScopedSuppressionArtifacts(root, key);
      continue;
    }
    for (const button of buttons) {
      if (button.dataset.characterSelect === actorId) button.classList.remove('selected');
    }
    for (const inline of card.querySelectorAll<HTMLElement>('.cockpit-inline-detail')) {
      const row = inline.previousElementSibling as HTMLElement | null;
      if (row?.dataset.characterSelect === actorId) inline.hidden = true;
    }
    for (const analysis of card.querySelectorAll<HTMLElement>('.character-analysis')) {
      if (analysis.closest('.cockpit-inline-detail, .raid-character-detail, .combat-retained-character-detail')) continue;
      analysis.hidden = true;
      if (analysis.nextElementSibling?.classList.contains('combat-ux-collapsed-note')) continue;
      const note = document.createElement('p');
      note.className = 'muted combat-ux-collapsed-note';
      note.textContent = 'Character details collapsed. Click the party member to expand them again.';
      analysis.insertAdjacentElement('afterend', note);
    }
  }
}

function clearScopedSuppressionArtifacts(root: HTMLElement, key: string): void {
  const card = activeCard(root, key);
  if (!card) return;
  for (const analysis of card.querySelectorAll<HTMLElement>('.character-analysis[hidden]')) {
    if (!analysis.closest('.raid-character-detail, .combat-retained-character-detail')) analysis.hidden = false;
  }
  for (const note of card.querySelectorAll<HTMLElement>('.combat-ux-collapsed-note')) note.remove();
}

function revealScopedDetails(root: HTMLElement, key: string, actorId: string): void {
  const card = activeCard(root, key);
  if (!card) return;
  for (const button of card.querySelectorAll<HTMLElement>('[data-character-select]')) {
    if (button.dataset.characterSelect === actorId) button.classList.add('selected');
  }
  for (const inline of card.querySelectorAll<HTMLElement>('.cockpit-inline-detail[hidden]')) {
    const row = inline.previousElementSibling as HTMLElement | null;
    if (row?.dataset.characterSelect === actorId) inline.hidden = false;
  }
  clearScopedSuppressionArtifacts(root, key);
}

function handleRetainedActorClick(root: HTMLElement, event: MouseEvent): void {
  const card = (event.target as Element | null)?.closest<HTMLElement>('[data-roster-actor-id]');
  if (!card || card.closest('.combat-retained-character-detail')) return;
  const key = activeRaidKey(card);
  const actorId = card.dataset.rosterActorId;
  if (!actorId || key === 'single') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressedActorByRaid.delete(key);
  clearScopedSuppressionArtifacts(root, key);
  toggleRetainedActor(key, actorId);
  scheduleSync(root);
}

function handleRetainedActorKeydown(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = (event.target as Element | null)?.closest<HTMLElement>('[data-roster-actor-id]');
  if (!card || event.target !== card) return;
  const key = activeRaidKey(card);
  const actorId = card.dataset.rosterActorId;
  if (!actorId || key === 'single') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  suppressedActorByRaid.delete(key);
  clearScopedSuppressionArtifacts(root, key);
  toggleRetainedActor(key, actorId);
  scheduleSync(root);
}

function toggleRetainedActor(key: string, actorId: string): void {
  if (retainedActorByRaid.get(key) === actorId) retainedActorByRaid.delete(key);
  else retainedActorByRaid.set(key, actorId);
}

function clearRetainedActorSelection(root: HTMLElement, key: string): void {
  retainedActorByRaid.delete(key);
  const active = activeCard(root, key);
  if (!active) return;
  for (const card of active.querySelectorAll<HTMLElement>('[data-roster-actor-id]')) {
    card.classList.remove('selected');
    card.setAttribute('aria-expanded', 'false');
  }
  for (const detail of active.querySelectorAll<HTMLElement>('.combat-retained-character-detail')) detail.remove();
}

function syncRetainedActorCards(
  root: HTMLElement,
  active: ReadonlyMap<string, ActiveCombatRaid>,
  metadata: EntityMetadataIndex,
): void {
  for (const detail of root.querySelectorAll<HTMLElement>('.combat-retained-character-detail[data-active-combat-key]')) {
    const key = detail.dataset.activeCombatKey;
    if (!key || retainedActorByRaid.get(key) !== detail.dataset.raidActorId) detail.remove();
  }

  for (const card of root.querySelectorAll<HTMLElement>('[data-roster-actor-id]')) {
    const key = activeRaidKey(card);
    const actorId = card.dataset.rosterActorId;
    const entry = key === 'single' ? undefined : active.get(key);
    if (!actorId || !entry) continue;
    const selected = retainedActorByRaid.get(key) === actorId;
    card.classList.add('combat-retained-selectable');
    card.classList.toggle('selected', selected);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-expanded', String(selected));
    if (selected) ensureRetainedActorDetail(card, entry, actorId, metadata);
  }
}

function ensureRetainedActorDetail(
  card: HTMLElement,
  entry: ActiveCombatRaid,
  actorId: string,
  metadata: EntityMetadataIndex,
): void {
  const active = card.closest<HTMLElement>('[data-active-combat-key]');
  const existing = [...(active?.querySelectorAll<HTMLElement>('.combat-retained-character-detail') ?? [])]
    .find((detail) => detail.dataset.raidActorId === actorId);
  if (existing) return;
  if (!entry.parse.characterDamage.some((row) => row.actorId === actorId)) return;

  const markup = renderCombatLayout('party-first', {
    raid: entry.parse,
    context: entry.context ?? null,
    metadata,
    selectedActorId: actorId,
    collapsedSections: new Set(['party', 'summons', 'participants', 'log']),
  });
  const template = document.createElement('template');
  template.innerHTML = markup;
  const analysis = template.content.querySelector<HTMLElement>('.character-analysis');
  if (!analysis) return;

  const detail = document.createElement('div');
  detail.className = 'raid-character-detail combat-retained-character-detail';
  detail.dataset.activeCombatKey = entry.key;
  detail.dataset.raidLocalId = `active:${entry.key}`;
  detail.dataset.raidActorId = actorId;
  detail.append(analysis);
  const roster = card.closest<HTMLElement>('.party-cards, .combat-roster-history');
  (roster ?? card).insertAdjacentElement('afterend', detail);
}

async function hydrateActiveCardVisuals(
  card: HTMLElement,
  entry: ActiveCombatRaid,
  metadata: EntityMetadataIndex,
): Promise<void> {
  const context = entry.context;
  for (const target of card.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]')) {
    const image = target.querySelector<HTMLElement>('.combat-image');
    if (!image || image.querySelector('img')) continue;
    const actorId = target.dataset.characterSelect ?? target.dataset.rosterActorId;
    const actor = actorId && context ? actorForVisual(context, actorId) : undefined;
    if (actor) {
      await hydrateActorImage(image, actor, metadata);
      continue;
    }
    const entryMetadata = actorId ? characterMetadata(metadata, actorId) : undefined;
    if (entryMetadata?.imageUrl) appendCombatImage(image, entryMetadata.imageUrl);
  }

  const bossImage = card.querySelector<HTMLElement>('.combat-boss-icon .combat-image');
  if (bossImage && !bossImage.querySelector('img') && entry.parse.boss?.id) {
    await hydrateImageContainerFromAsset(bossImage, 'boss', entry.parse.boss.id);
  }
}

async function hydrateActorImage(
  container: HTMLElement,
  actor: CombatActorContext,
  metadata: EntityMetadataIndex,
): Promise<void> {
  if (container.querySelector('img')) return;
  const entry = actor.id ? characterMetadata(metadata, actor.id, actor.name) : actor.name ? findMetadataByName(metadata, actor.name) : undefined;
  if (entry?.imageUrl) {
    appendCombatImage(container, entry.imageUrl);
    return;
  }
  const imageId = actorVisualImageId(actor);
  if (imageId) await hydrateImageContainerFromAsset(container, 'character', imageId);
}

function actorForVisual(context: CombatParseContext, actorId: string): CombatActorContext | undefined {
  return context.actors?.find((actor) => actor.id === actorId)
    ?? context.actorSlots.find((actor) => actor.id === actorId);
}

async function hydrateImageContainerFromAsset(
  container: HTMLElement,
  kind: 'character' | 'boss',
  assetId: string,
): Promise<void> {
  if (container.querySelector('img')) return;
  const source = await resolveWikiCombatAssetImage(kind, assetId);
  if (source) appendCombatImage(container, source);
}

function appendCombatImage(container: HTMLElement, source: string): void {
  if (!container.isConnected || container.querySelector('img')) return;
  const image = document.createElement('img');
  image.dataset.combatImage = 'true';
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = source;
  container.append(image);
}

function characterMetadata(
  index: EntityMetadataIndex,
  actorId: string,
  actorName?: string,
): EntityMetadata | undefined {
  return index.characters.get(actorId) ?? (actorName ? findMetadataByName(index, actorName) : undefined);
}

function findMetadataByName(index: EntityMetadataIndex, name: string): EntityMetadata | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const metadata of index.characters.values()) {
    if (metadata.name.toLowerCase() === normalized || metadata.wikiTitle.toLowerCase() === normalized) return metadata;
  }
  return undefined;
}

function combatMetadata(): Promise<EntityMetadataIndex> {
  if (!metadataPromise) metadataPromise = loadWikiEntityMetadata().catch(() => EMPTY_ENTITY_METADATA);
  return metadataPromise;
}

function activeCard(root: HTMLElement, key: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[data-active-combat-key]')]
    .find((card) => card.dataset.activeCombatKey === key);
}

function activeRaidKey(element: Element): string {
  return element.closest<HTMLElement>('[data-active-combat-key]')?.dataset.activeCombatKey ?? 'single';
}
