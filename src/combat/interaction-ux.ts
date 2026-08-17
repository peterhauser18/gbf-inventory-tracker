import './interaction-ux.css';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadata,
  type EntityMetadataIndex,
} from '../dashboard/wiki-metadata.ts';
import { buildCharacterAnalyses } from './analytics.ts';
import { renderCombatLayout } from './layouts.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import { getCombatLiveContext, getLatestCombatParse, getRaidHistory } from './storage.ts';
import type { RaidHistoryRecord } from './types.ts';
import { actorVisualImageId } from './visual-context.ts';
import { resolveWikiCombatAssetImage } from './wiki-visuals.ts';

const combatLogOpenByPreset = new Map<string, boolean>();
const skillOpenByKey = new Map<string, boolean>();
const raidDropOpenById = new Map<string, boolean>();
const selectedRaidActorById = new Map<string, string>();
let suppressedCombatActorId: string | null = null;
let raidAnnotationPending = false;
let raidAnnotationQueued = false;
let combatVisualHydrationPending = false;
let combatVisualHydrationQueued = false;
let combatVisualMetadataPromise: Promise<EntityMetadataIndex> | null = null;

export function installCombatRaidInteractionUx(root: HTMLElement): void {
  root.addEventListener('click', (event) => handleClick(root, event), true);
  root.addEventListener('keydown', (event) => handleKeydown(root, event), true);

  const observer = new MutationObserver(() => applyInteractionUx(root));
  observer.observe(root, { childList: true, subtree: true });
  applyInteractionUx(root);
}

function applyInteractionUx(root: HTMLElement): void {
  const section = root.querySelector<HTMLElement>('[data-combat-section]');
  if (!section) return;

  collapseCombatLogsByDefault(section);
  wrapSkillBreakdowns(section);
  applyCombatSuppression(section);
  removeLocalNotes(section);
  collapseRaidDropsByDefault(section);
  void annotateRaidCharacterRows(section);
  void hydrateCombatVisuals(section);
}

function collapseCombatLogsByDefault(section: HTMLElement): void {
  for (const details of section.querySelectorAll<HTMLDetailsElement>('.combat-accordion')) {
    const summary = details.querySelector<HTMLElement>(':scope > summary');
    if (summary?.textContent?.trim() !== 'Combat Log') continue;
    const key = combatPresetKey(details);
    bindDefaultCollapsedDetails(details, combatLogOpenByPreset, key, 'uxCombatLogBound');
  }
}

function wrapSkillBreakdowns(section: HTMLElement): void {
  for (const breakdown of section.querySelectorAll<HTMLElement>('.skill-breakdown')) {
    if (breakdown.closest('.combat-ux-skills')) continue;

    const key = skillStateKey(breakdown);
    const details = document.createElement('details');
    details.className = 'combat-accordion combat-ux-skills';
    details.dataset.uxSkillKey = key;
    details.open = skillOpenByKey.get(key) ?? false;

    const summary = document.createElement('summary');
    summary.textContent = 'Skills';
    const body = document.createElement('div');
    breakdown.insertAdjacentElement('beforebegin', details);
    body.append(breakdown);
    details.append(summary, body);
    details.addEventListener('toggle', () => skillOpenByKey.set(key, details.open));
  }
}

function bindDefaultCollapsedDetails(
  details: HTMLDetailsElement,
  state: Map<string, boolean>,
  key: string,
  datasetKey: 'uxCombatLogBound' | 'uxRaidDropsBound',
): void {
  if (!state.has(key)) state.set(key, false);
  const desired = state.get(key) ?? false;
  if (details.open !== desired) details.open = desired;
  if (details.dataset[datasetKey] === 'true') return;
  details.dataset[datasetKey] = 'true';
  details.addEventListener('toggle', () => state.set(key, details.open));
}

function handleClick(root: HTMLElement, event: MouseEvent): void {
  const target = event.target as Element | null;
  const raidRow = target?.closest<HTMLElement>('.raid-character-row');
  if (raidRow) {
    event.preventDefault();
    event.stopPropagation();
    toggleRaidCharacter(root, raidRow);
    return;
  }

  const partyButton = target?.closest<HTMLElement>('[data-character-select]');
  if (!partyButton || partyButton.closest('.raid-character-detail')) return;
  const actorId = partyButton.dataset.characterSelect;
  if (!actorId) return;

  const section = root.querySelector<HTMLElement>('[data-combat-section]');
  if (!section) return;

  if (suppressedCombatActorId === actorId) {
    suppressedCombatActorId = null;
    revealCombatDetails(section, actorId);
    return;
  }

  if (partyButton.classList.contains('selected')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressedCombatActorId = actorId;
    applyCombatSuppression(section);
    return;
  }

  if (suppressedCombatActorId) revealCombatDetails(section, suppressedCombatActorId);
  suppressedCombatActorId = null;
}

function handleKeydown(root: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = (event.target as Element | null)?.closest<HTMLElement>('.raid-character-row');
  if (!row) return;
  event.preventDefault();
  toggleRaidCharacter(root, row);
}

function applyCombatSuppression(section: HTMLElement): void {
  const actorId = suppressedCombatActorId;
  if (!actorId) return;

  for (const button of section.querySelectorAll<HTMLElement>('[data-character-select]')) {
    if (button.dataset.characterSelect === actorId) button.classList.remove('selected');
  }

  for (const inline of section.querySelectorAll<HTMLElement>('.cockpit-inline-detail')) {
    const row = inline.previousElementSibling as HTMLElement | null;
    if (row?.dataset.characterSelect === actorId) inline.hidden = true;
  }

  for (const analysis of section.querySelectorAll<HTMLElement>('.character-analysis')) {
    if (analysis.closest('.cockpit-inline-detail, .raid-character-detail')) continue;
    analysis.hidden = true;
    if (analysis.nextElementSibling?.classList.contains('combat-ux-collapsed-note')) continue;
    const note = document.createElement('p');
    note.className = 'muted combat-ux-collapsed-note';
    note.textContent = 'Character details collapsed. Click the party member to expand them again.';
    analysis.insertAdjacentElement('afterend', note);
  }
}

function revealCombatDetails(section: HTMLElement, actorId: string): void {
  for (const button of section.querySelectorAll<HTMLElement>('[data-character-select]')) {
    if (button.dataset.characterSelect === actorId) button.classList.add('selected');
  }
  for (const inline of section.querySelectorAll<HTMLElement>('.cockpit-inline-detail[hidden]')) inline.hidden = false;
  for (const analysis of section.querySelectorAll<HTMLElement>('.character-analysis[hidden]')) {
    if (!analysis.closest('.raid-character-detail')) analysis.hidden = false;
  }
  for (const note of section.querySelectorAll<HTMLElement>('.combat-ux-collapsed-note')) note.remove();
}

function removeLocalNotes(section: HTMLElement): void {
  for (const note of section.querySelectorAll<HTMLElement>('.raid-note')) note.remove();
}

function collapseRaidDropsByDefault(section: HTMLElement): void {
  for (const details of section.querySelectorAll<HTMLDetailsElement>('[data-raid-drops-collapse]')) {
    const localId = details.dataset.raidDropsCollapse;
    if (!localId) continue;
    bindDefaultCollapsedDetails(details, raidDropOpenById, localId, 'uxRaidDropsBound');
  }
}

async function hydrateCombatVisuals(section: HTMLElement): Promise<void> {
  if (!hasMissingCombatVisual(section)) return;
  if (combatVisualHydrationPending) {
    combatVisualHydrationQueued = true;
    return;
  }

  combatVisualHydrationPending = true;
  try {
    const [context, raid, metadata] = await Promise.all([
      getCombatLiveContext(),
      getLatestCombatParse(),
      combatVisualMetadata(),
    ]);
    if (context) await hydrateActorVisuals(section, context, metadata);
    await hydrateRaidDetailVisuals(section, metadata);
    const bossImage = section.querySelector<HTMLElement>('.combat-boss-icon .combat-image');
    if (bossImage && !bossImage.querySelector('img') && raid?.boss?.id) {
      await hydrateImageContainerFromAsset(bossImage, 'boss', raid.boss.id);
    }
  } finally {
    combatVisualHydrationPending = false;
    if (combatVisualHydrationQueued) {
      combatVisualHydrationQueued = false;
      void hydrateCombatVisuals(section);
    }
  }
}

function hasMissingCombatVisual(section: HTMLElement): boolean {
  const actorTargets = section.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]');
  for (const target of actorTargets) {
    const image = target.querySelector<HTMLElement>('.combat-image');
    if (image && !image.querySelector('img')) return true;
  }
  const analysisImages = section.querySelectorAll<HTMLElement>('.character-analysis .analysis-portrait .combat-image');
  for (const image of analysisImages) if (!image.querySelector('img')) return true;
  const bossImage = section.querySelector<HTMLElement>('.combat-boss-icon .combat-image');
  return Boolean(bossImage && !bossImage.querySelector('img'));
}

async function hydrateActorVisuals(
  section: HTMLElement,
  context: CombatParseContext,
  metadata: EntityMetadataIndex,
): Promise<void> {
  const targets = section.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]');
  for (const target of targets) {
    const image = target.querySelector<HTMLElement>('.combat-image');
    if (!image || image.querySelector('img')) continue;
    const actorId = target.dataset.characterSelect ?? target.dataset.rosterActorId;
    const actor = actorId ? actorForVisual(context, actorId) : undefined;
    if (actor) await hydrateActorImage(image, actor, metadata);
  }

  const selectedId = section.querySelector<HTMLElement>('[data-character-select].selected')?.dataset.characterSelect;
  const selectedActor = selectedId ? actorForVisual(context, selectedId) : undefined;
  if (!selectedActor) return;
  for (const image of section.querySelectorAll<HTMLElement>('.character-analysis .analysis-portrait .combat-image')) {
    if (!image.closest('.raid-character-detail') && !image.querySelector('img')) {
      await hydrateActorImage(image, selectedActor, metadata);
    }
  }
}

async function hydrateRaidDetailVisuals(section: HTMLElement, metadata: EntityMetadataIndex): Promise<void> {
  for (const detail of section.querySelectorAll<HTMLElement>('.raid-character-detail[data-raid-actor-id]')) {
    const image = detail.querySelector<HTMLElement>('.analysis-portrait .combat-image');
    if (!image || image.querySelector('img')) continue;
    const actorId = detail.dataset.raidActorId;
    const label = detail.querySelector<HTMLElement>('.analysis-character h3')?.textContent?.trim();
    const entry = actorId ? characterMetadata(metadata, actorId, label) : label ? findMetadataByName(metadata, label) : undefined;
    if (entry?.imageUrl) appendCombatImage(image, entry.imageUrl);
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

function combatVisualMetadata(): Promise<EntityMetadataIndex> {
  if (!combatVisualMetadataPromise) {
    combatVisualMetadataPromise = loadWikiEntityMetadata().catch(() => EMPTY_ENTITY_METADATA);
  }
  return combatVisualMetadataPromise;
}

async function annotateRaidCharacterRows(section: HTMLElement): Promise<void> {
  if (raidAnnotationPending) {
    raidAnnotationQueued = true;
    return;
  }
  const cards = [...section.querySelectorAll<HTMLElement>('.raid-card')];
  if (!cards.length) return;

  raidAnnotationPending = true;
  try {
    const history = await getRaidHistory();
    const byId = new Map(history.map((raid) => [raid.localId, raid]));
    for (const card of cards) annotateRaidCard(card, byId);
  } finally {
    raidAnnotationPending = false;
    if (raidAnnotationQueued) {
      raidAnnotationQueued = false;
      void annotateRaidCharacterRows(section);
    }
  }
}

function annotateRaidCard(card: HTMLElement, history: ReadonlyMap<string, RaidHistoryRecord>): void {
  const localId = card.querySelector<HTMLDetailsElement>('[data-raid-combat-collapse]')?.dataset.raidCombatCollapse;
  if (!localId) return;
  const raid = history.get(localId);
  if (!raid) return;

  const analyses = buildCharacterAnalyses(raid);
  const rows = [...card.querySelectorAll<HTMLElement>('.raid-combat-table .raid-combat-row:not(.head)')];
  const selectedActorId = selectedRaidActorById.get(localId);

  for (const detail of card.querySelectorAll<HTMLElement>('.raid-character-detail')) {
    if (detail.dataset.raidActorId !== selectedActorId) detail.remove();
  }

  rows.forEach((row, index) => {
    const analysis = analyses[index];
    if (!analysis) return;
    const selected = analysis.actorId === selectedActorId;
    row.classList.add('raid-character-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-expanded', String(selected));
    row.dataset.raidCharacterLocalId = localId;
    row.dataset.raidCharacterActorId = analysis.actorId;
    row.classList.toggle('selected', selected);
    if (selected) ensureRaidCharacterDetail(row, raid, analysis.actorId);
  });
}

function toggleRaidCharacter(root: HTMLElement, row: HTMLElement): void {
  const localId = row.dataset.raidCharacterLocalId;
  const actorId = row.dataset.raidCharacterActorId;
  if (!localId || !actorId) return;

  if (selectedRaidActorById.get(localId) === actorId) selectedRaidActorById.delete(localId);
  else selectedRaidActorById.set(localId, actorId);

  const section = root.querySelector<HTMLElement>('[data-combat-section]');
  if (!section) return;
  void annotateRaidCharacterRows(section);
}

function ensureRaidCharacterDetail(row: HTMLElement, raid: RaidHistoryRecord, actorId: string): void {
  const next = row.nextElementSibling as HTMLElement | null;
  if (next?.classList.contains('raid-character-detail') && next.dataset.raidActorId === actorId) return;

  const markup = renderCombatLayout('combat-cockpit', {
    raid,
    selectedActorId: actorId,
  });
  const template = document.createElement('template');
  template.innerHTML = markup;
  const sharedDetail = template.content.querySelector<HTMLElement>('.cockpit-inline-detail');
  if (!sharedDetail) return;

  const detail = document.createElement('div');
  detail.className = 'raid-character-detail';
  detail.dataset.raidActorId = actorId;
  detail.dataset.raidLocalId = raid.localId;
  detail.innerHTML = sharedDetail.innerHTML;
  row.insertAdjacentElement('afterend', detail);
}

function combatPresetKey(element: Element): string {
  const preset = element.closest<HTMLElement>('.combat-preset');
  return [...(preset?.classList ?? [])].find((className) => className.startsWith('preset-')) ?? 'combat-default';
}

function skillStateKey(breakdown: HTMLElement): string {
  const raidDetail = breakdown.closest<HTMLElement>('.raid-character-detail');
  if (raidDetail) {
    return `raid:${raidDetail.dataset.raidLocalId ?? 'unknown'}:${raidDetail.dataset.raidActorId ?? 'unknown'}`;
  }

  const preset = combatPresetKey(breakdown);
  const section = breakdown.closest<HTMLElement>('[data-combat-section]');
  const actorId = section?.querySelector<HTMLElement>('[data-character-select].selected')?.dataset.characterSelect ?? 'selected';
  return `combat:${preset}:${actorId}`;
}
