import './cockpit-final-polish.css';
import { buildCharacterAnalyses, type CharacterCombatAnalysis } from './analytics.ts';
import { readPersistedRaidLoadouts } from './loadout-read.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import { getActiveCombatRaids } from './storage.ts';
import type { NormalizedRaidParse } from './types.ts';
import { resolveSafeExternalImageUrl } from '../dashboard/resolver.ts';

const WIKI_API = 'https://gbf.wiki/api.php';
const rememberedActorImages = new Map<string, string>();
const classThumbnailPromises = new Map<string, Promise<string | undefined>>();
let latestDecorationRun = 0;

export function applyCockpitFinalPolish(root: HTMLElement): void {
  removeAverageTurnFromCockpit(root);
  normalizeCompactBacklineLabels(root);
}

export async function decorateCockpitRosterPresentation(root: HTMLElement): Promise<void> {
  const run = ++latestDecorationRun;
  const [active, persisted] = await Promise.all([
    getActiveCombatRaids(),
    readPersistedRaidLoadouts(),
  ]);
  if (run !== latestDecorationRun || !root.isConnected) return;

  const activeByKey = new Map(active.map((entry) => [entry.key, entry]));
  for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
    const key = card.dataset.activeCombatKey;
    const entry = key ? activeByKey.get(key) : undefined;
    if (!key || !entry?.context) continue;
    preserveExistingActorImages(card, key);
    normalizeActiveRoster(card, key, entry.parse, entry.context);
    void hydrateMainCharacterImage(card, persisted.active.get(key));
  }

  for (const card of root.querySelectorAll<HTMLElement>('.raid-card')) {
    const localId = card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport;
    if (!localId) continue;
    void hydrateMainCharacterImage(card, persisted.history.get(localId));
  }
}

function removeAverageTurnFromCockpit(root: HTMLElement): void {
  for (const stats of root.querySelectorAll<HTMLElement>('.preset-combat-cockpit .combat-live-stats')) {
    for (const item of stats.querySelectorAll<HTMLElement>(':scope > .live-stat')) {
      const label = item.querySelector<HTMLElement>(':scope > span')?.textContent?.trim();
      if (label === 'Average / Turn') item.remove();
    }
  }
}

function normalizeCompactBacklineLabels(root: HTMLElement): void {
  for (const card of root.querySelectorAll<HTMLElement>('.preset-combat-cockpit .party-cards-compact .party-card')) {
    card.querySelector('.party-card-history-note')?.remove();
    const slot = card.querySelector<HTMLElement>('.party-slot')?.textContent?.trim();
    if (!slot?.startsWith('B')) continue;
    const number = slot.slice(1) || '?';
    const tag = ensureStateTag(card);
    if (card.classList.contains('dead')) tag.textContent = `Dead · Backline ${number}`;
    else if (card.classList.contains('replacement')) tag.textContent = `Backline ${number} · Active`;
    else tag.textContent = `Backline ${number}`;
  }
}

function normalizeActiveRoster(
  card: HTMLElement,
  key: string,
  raid: NormalizedRaidParse,
  context: CombatParseContext,
): void {
  const roster = (context.actors ?? [])
    .filter((actor) => actor.id || actor.name || actor.hp !== undefined || actor.maxHp !== undefined)
    .slice(0, 6);
  if (!roster.length) return;

  const analyses = new Map(buildCharacterAnalyses(raid).map((entry) => [entry.actorId, entry]));
  normalizeCockpitTable(card, key, roster, context, analyses);
  normalizeCockpitPartyCards(card, key, roster, context, raid);
}

function normalizeCockpitTable(
  scope: HTMLElement,
  key: string,
  roster: readonly CombatActorContext[],
  context: CombatParseContext,
  analyses: ReadonlyMap<string, CharacterCombatAnalysis>,
): void {
  const table = scope.querySelector<HTMLElement>('.preset-combat-cockpit .cockpit-table');
  if (!table) return;
  const rows = [...table.querySelectorAll<HTMLElement>('button.cockpit-row')];
  const used = new Set<HTMLElement>();

  roster.forEach((actor, index) => {
    const actorId = actor.id;
    let row = actorId ? rows.find((candidate) => candidate.dataset.characterSelect === actorId) : undefined;
    if (!row) row = createCockpitRow(key, actor, index, context, actorId ? analyses.get(actorId) : undefined);
    used.add(row);
    if (actorId) row.dataset.characterSelect = actorId;
    applyActorStateClasses(row, actorState(context, actor, index));
    table.append(row);
  });

  for (const row of rows) if (!used.has(row)) row.remove();
}

function normalizeCockpitPartyCards(
  scope: HTMLElement,
  key: string,
  roster: readonly CombatActorContext[],
  context: CombatParseContext,
  raid: NormalizedRaidParse,
): void {
  const party = scope.querySelector<HTMLElement>('.preset-combat-cockpit .party-cards-compact');
  if (!party) return;
  const cards = [...party.querySelectorAll<HTMLElement>(':scope > .party-card')];
  const used = new Set<HTMLElement>();

  roster.forEach((actor, index) => {
    const actorId = actor.id;
    let partyCard = actorId
      ? cards.find((candidate) => (candidate.dataset.characterSelect ?? candidate.dataset.rosterActorId) === actorId)
      : undefined;
    if (!partyCard) partyCard = createPartyCard(key, actor, index, context, raid);
    used.add(partyCard);
    if (actorId) {
      partyCard.dataset.characterSelect = actorId;
      delete partyCard.dataset.rosterActorId;
    }
    updatePartyCardSlotAndState(partyCard, actor, index, context);
    partyCard.querySelector('.party-card-history-note')?.remove();
    party.append(partyCard);
  });

  for (const partyCard of cards) if (!used.has(partyCard)) partyCard.remove();
}

function createCockpitRow(
  key: string,
  actor: CombatActorContext,
  index: number,
  context: CombatParseContext,
  analysis: CharacterCombatAnalysis | undefined,
): HTMLButtonElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'cockpit-row';
  if (actor.id) row.dataset.characterSelect = actor.id;

  const character = document.createElement('span');
  character.className = 'cockpit-character';
  character.append(createCombatImage(key, actor, actorLabel(actor, index, context)));
  const copy = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = actorLabel(actor, index, context);
  const hp = document.createElement('span');
  hp.className = 'actor-hp';
  hp.textContent = actorHpLabel(actor);
  copy.append(name, hp);
  character.append(copy);
  row.append(character);

  const total = document.createElement('strong');
  total.textContent = optionalNumber(analysis?.totalDamage);
  row.append(total);
  for (const value of [
    analysis?.breakdown.normal,
    analysis?.breakdown.skill,
    analysis?.breakdown.ougi,
    analysis?.breakdown.echo,
    analysis?.breakdown.supplemental,
  ]) {
    const cell = document.createElement('span');
    cell.textContent = optionalNumber(value);
    row.append(cell);
  }
  const crit = document.createElement('span');
  crit.textContent = analysis?.criticalRate === undefined ? '—' : `${(analysis.criticalRate * 100).toFixed(1)}%`;
  row.append(crit);
  return row;
}

function createPartyCard(
  key: string,
  actor: CombatActorContext,
  index: number,
  context: CombatParseContext,
  raid: NormalizedRaidParse,
): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'party-card party-card-history';
  if (actor.id) card.dataset.characterSelect = actor.id;

  const visual = document.createElement('span');
  visual.className = 'party-card-visual';
  visual.append(createCombatImage(key, actor, actorLabel(actor, index, context)));

  const copy = document.createElement('span');
  copy.className = 'party-card-copy';
  const name = document.createElement('strong');
  name.textContent = actorLabel(actor, index, context);
  const hp = document.createElement('span');
  hp.className = 'actor-hp muted';
  hp.textContent = actorHpLabel(actor);
  const damage = document.createElement('span');
  damage.className = 'party-card-damage';
  const total = actor.id ? raid.characterDamage.find((entry) => entry.actorId === actor.id)?.total : undefined;
  damage.textContent = total === undefined ? 'Damage —' : `${formatNumber(total)} dmg`;
  copy.append(name, hp, damage);

  const slot = document.createElement('span');
  slot.className = 'party-slot';
  card.append(visual, copy, slot);
  return card;
}

function updatePartyCardSlotAndState(
  card: HTMLElement,
  actor: CombatActorContext,
  index: number,
  context: CombatParseContext,
): void {
  const state = actorState(context, actor, index);
  applyActorStateClasses(card, state);
  const slot = card.querySelector<HTMLElement>('.party-slot');
  if (slot) slot.textContent = index >= 4 ? `B${index - 3}` : String(index + 1);

  const tagRequired = state !== 'active' || index >= 4;
  const existingTag = card.querySelector<HTMLElement>('.state-tag');
  if (!tagRequired) {
    existingTag?.remove();
    return;
  }
  const tag = existingTag ?? ensureStateTag(card);
  tag.classList.toggle('danger', state === 'dead');
  if (state === 'dead') tag.textContent = index >= 4 ? `Dead · Backline ${index - 3}` : 'Dead';
  else if (state === 'replacement') tag.textContent = `Backline ${index - 3} · Active`;
  else if (index >= 4) tag.textContent = `Backline ${index - 3}`;
  else tag.textContent = 'Inactive';
}

function ensureStateTag(card: HTMLElement): HTMLElement {
  let tag = card.querySelector<HTMLElement>('.state-tag');
  if (tag) return tag;
  tag = document.createElement('span');
  tag.className = 'state-tag';
  const copy = card.querySelector<HTMLElement>('.party-card-copy');
  (copy ?? card).append(tag);
  return tag;
}

function actorState(
  context: CombatParseContext,
  actor: CombatActorContext,
  originalIndex: number,
): 'active' | 'dead' | 'replacement' | 'inactive' {
  if (actor.alive === false || actor.hp === 0) return 'dead';
  const currentIndex = actor.id
    ? context.actorSlots.findIndex((slot) => slot.id === actor.id)
    : -1;
  if (currentIndex >= 0 && currentIndex < 4) return originalIndex >= 4 ? 'replacement' : 'active';
  return 'inactive';
}

function applyActorStateClasses(
  element: HTMLElement,
  state: 'active' | 'dead' | 'replacement' | 'inactive',
): void {
  element.classList.remove('active', 'dead', 'replacement', 'inactive', 'reserve');
  element.classList.add(state);
  if (state === 'inactive') element.classList.add('reserve');
}

function preserveExistingActorImages(scope: HTMLElement, key: string): void {
  for (const element of scope.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]')) {
    const actorId = element.dataset.characterSelect ?? element.dataset.rosterActorId;
    const src = element.querySelector<HTMLImageElement>('.combat-image img[data-combat-image]')?.getAttribute('src');
    if (actorId && src) rememberedActorImages.set(actorImageKey(key, actorId), src);
  }
}

function createCombatImage(
  key: string,
  actor: CombatActorContext,
  label: string,
): HTMLElement {
  const image = document.createElement('span');
  image.className = 'combat-image';
  const fallback = document.createElement('span');
  fallback.textContent = actorInitials(label);
  image.append(fallback);
  const src = actor.id ? rememberedActorImages.get(actorImageKey(key, actor.id)) : undefined;
  if (src) installImage(image, src);
  return image;
}

async function hydrateMainCharacterImage(
  scope: HTMLElement,
  loadout: RaidLoadoutSnapshot | undefined,
): Promise<void> {
  const jobName = loadout?.jobName?.trim();
  if (!jobName) return;
  const source = await resolveClassThumbnail(jobName);
  if (!source || !scope.isConnected) return;

  const targets: HTMLElement[] = [];
  const tableRow = scope.querySelector<HTMLElement>('.preset-combat-cockpit .cockpit-table > button.cockpit-row');
  const partyCard = scope.querySelector<HTMLElement>('.preset-combat-cockpit .party-cards-compact > .party-card');
  const tableImage = tableRow?.querySelector<HTMLElement>('.combat-image');
  const partyImage = partyCard?.querySelector<HTMLElement>('.combat-image');
  if (tableImage) targets.push(tableImage);
  if (partyImage && partyImage !== tableImage) targets.push(partyImage);
  for (const target of targets) if (!target.querySelector('img')) installImage(target, source);
}

function resolveClassThumbnail(jobName: string): Promise<string | undefined> {
  const key = jobName.toLocaleLowerCase();
  const existing = classThumbnailPromises.get(key);
  if (existing) return existing;
  const pending = loadClassThumbnail(jobName).catch(() => undefined);
  classThumbnailPromises.set(key, pending);
  return pending;
}

async function loadClassThumbnail(jobName: string): Promise<string | undefined> {
  const url = new URL(WIKI_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', '360');
  url.searchParams.set('titles', jobName);
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) return undefined;
  const body = await response.json() as unknown;
  if (!obj(body) || !obj(body.query) || !obj(body.query.pages)) return undefined;
  for (const page of Object.values(body.query.pages)) {
    if (!obj(page) || !obj(page.thumbnail)) continue;
    const source = text(page.thumbnail.source);
    const safe = resolveSafeExternalImageUrl(source);
    if (safe) return safe;
  }
  return undefined;
}

function installImage(target: HTMLElement, source: string): void {
  const image = document.createElement('img');
  image.dataset.combatImage = 'true';
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.remove(), { once: true });
  target.append(image);
}

function actorLabel(actor: CombatActorContext, index: number, context: CombatParseContext): string {
  if (actor.id && actor.id === context.mainCharacterId) return context.accountDisplayName ?? 'Main Character';
  return actor.name ?? (index === 0 ? context.accountDisplayName ?? 'Main Character' : `Party member ${index + 1}`);
}

function actorHpLabel(actor: CombatActorContext): string {
  if (actor.hp === undefined || actor.maxHp === undefined || actor.maxHp <= 0) return 'HP —';
  const percent = actor.hp / actor.maxHp * 100;
  return `${formatNumber(actor.hp)} (${percent.toFixed(1)}%) / ${formatNumber(actor.maxHp)}`;
}

function actorInitials(label: string): string {
  const normalized = label.trim();
  if (/^(?:main character|mc)$/i.test(normalized)) return 'MC';
  return normalized.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function actorImageKey(raidKey: string, actorId: string): string {
  return `${raidKey}\u0000${actorId}`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? '—' : formatNumber(value);
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function obj(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
