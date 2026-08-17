import './live-ui-fixes.css';
import { getActiveCombatRaids, type ActiveCombatRaid } from './storage.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import type { NormalizedRaidParse } from './types.ts';
import {
  combatInitials,
  liveDurationLabel,
  missingRosterActors,
  participantSummary,
  type MissingRosterActor,
} from './live-ui-state.ts';

let liveRaids = new Map<string, ActiveCombatRaid>();

export async function refreshCombatLiveUiState(): Promise<void> {
  const active = await getActiveCombatRaids();
  liveRaids = new Map(active.map((entry) => [entry.key, entry]));
}

export function applyCombatLiveUiFixes(root: HTMLElement, now = Date.now()): void {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-active-combat-key]')];
  if (cards.length > 0) {
    for (const card of cards) {
      const key = card.dataset.activeCombatKey;
      const entry = key ? liveRaids.get(key) : undefined;
      if (entry) applyRaidFixes(card, entry.parse, entry.context ?? null, now);
    }
    return;
  }

  const first = liveRaids.values().next().value as ActiveCombatRaid | undefined;
  if (first) applyRaidFixes(root, first.parse, first.context ?? null, now);
}

function applyRaidFixes(
  root: HTMLElement,
  raid: NormalizedRaidParse,
  context: CombatParseContext | null,
  now: number,
): void {
  updateDuration(root, raid, now);
  updateParticipants(root, raid, context);
  keepSixRosterMembersVisible(root, context, raid);
  improvePartyStateLabels(root);
  ensureMainCharacterFallback(root, context);
  ensureBossFallback(root, raid);
  normalizeSummonPresentation(root);
}

function updateDuration(root: HTMLElement, raid: NormalizedRaidParse, now: number): void {
  const duration = liveDurationLabel(raid, now);
  const fact = findLabeled(root, '.header-fact', 'Duration');
  const value = fact?.querySelector<HTMLElement>('strong');
  if (value) value.textContent = duration;
}

function updateParticipants(
  root: HTMLElement,
  raid: NormalizedRaidParse,
  context: CombatParseContext | null,
): void {
  const summary = participantSummary(raid, context);
  const stat = findLabeled(root, '.live-stat', 'Participants');
  const value = stat?.querySelector<HTMLElement>('strong');
  if (value) value.textContent = summary;

  for (const details of root.querySelectorAll<HTMLDetailsElement>('.combat-accordion')) {
    const heading = details.querySelector<HTMLElement>(':scope > summary');
    if (!heading?.textContent?.trim().startsWith('Participants')) continue;
    heading.textContent = `Participants · ${summary}`;
  }
}

function keepSixRosterMembersVisible(
  root: HTMLElement,
  context: CombatParseContext | null,
  raid: NormalizedRaidParse,
): void {
  if (!context?.actors?.length) return;
  const representedIds = new Set<string>();
  for (const element of root.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]')) {
    const id = element.dataset.characterSelect ?? element.dataset.rosterActorId;
    if (id) representedIds.add(id);
  }
  const missing = missingRosterActors(context, representedIds);
  if (!missing.length) return;

  const party = root.querySelector<HTMLElement>('.party-cards');
  if (party) {
    const room = Math.max(0, 6 - party.querySelectorAll('.party-card').length);
    for (const member of missing.slice(0, room)) party.append(createHistoryCard(member, context, raid));
    return;
  }

  const cockpit = root.querySelector<HTMLElement>('.cockpit-table');
  if (!cockpit || cockpit.parentElement?.querySelector(':scope > .combat-roster-history')) return;
  const history = document.createElement('div');
  history.className = 'combat-roster-history';
  for (const member of missing) history.append(createHistoryCard(member, context, raid));
  cockpit.insertAdjacentElement('afterend', history);
}

function createHistoryCard(
  member: MissingRosterActor,
  context: CombatParseContext,
  raid: NormalizedRaidParse,
): HTMLElement {
  const { actor, originalIndex, state } = member;
  const label = actor.id === context.mainCharacterId
    ? context.accountDisplayName ?? 'Main Character'
    : actor.name ?? `Party member ${originalIndex + 1}`;
  const card = document.createElement('article');
  card.className = `party-card party-card-history ${state === 'reserve' ? 'inactive reserve' : state}`;
  if (actor.id) card.dataset.rosterActorId = actor.id;

  const visual = document.createElement('span');
  visual.className = 'party-card-visual';
  const image = document.createElement('span');
  image.className = 'combat-image';
  const fallback = document.createElement('span');
  fallback.textContent = actor.id === context.mainCharacterId ? 'MC' : combatInitials(label);
  image.append(fallback);
  visual.append(image);

  const copy = document.createElement('span');
  copy.className = 'party-card-copy';
  const name = document.createElement('strong');
  name.textContent = label;
  const damage = document.createElement('span');
  damage.className = 'party-card-damage';
  const attributedDamage = actor.id
    ? raid.characterDamage.find((entry) => entry.actorId === actor.id)?.total
    : undefined;
  damage.textContent = attributedDamage === undefined ? 'Damage —' : `${formatNumber(attributedDamage)} dmg`;
  const hp = document.createElement('span');
  hp.className = 'actor-hp muted';
  hp.textContent = formatActorHp(actor);
  const tag = document.createElement('span');
  tag.className = `state-tag${state === 'dead' ? ' danger' : ''}`;
  tag.textContent = stateLabel(state, originalIndex);
  const note = document.createElement('span');
  note.className = 'party-card-history-note';
  note.textContent = 'Retained from verified party history';
  copy.append(name, damage, hp, tag, note);

  const slot = document.createElement('span');
  slot.className = 'party-slot';
  slot.textContent = originalIndex >= 4 ? `B${originalIndex - 3}` : String(originalIndex + 1);
  card.append(visual, copy, slot);
  return card;
}

function improvePartyStateLabels(root: HTMLElement): void {
  for (const card of root.querySelectorAll<HTMLElement>('.party-card')) {
    const tag = card.querySelector<HTMLElement>('.state-tag');
    if (!tag) continue;
    if (card.classList.contains('replacement')) tag.textContent = 'Promoted · Active';
    else if (card.classList.contains('inactive') && card.querySelector('.party-slot')?.textContent?.startsWith('B')) {
      tag.textContent = 'Backline · Reserve';
    }
  }
}

function ensureMainCharacterFallback(root: HTMLElement, context: CombatParseContext | null): void {
  const id = context?.mainCharacterId;
  if (!id) return;
  const cards = root.querySelectorAll<HTMLElement>('[data-character-select], [data-roster-actor-id]');
  const card = [...cards].find((entry) => (entry.dataset.characterSelect ?? entry.dataset.rosterActorId) === id);
  const image = card?.querySelector<HTMLElement>('.combat-image');
  if (!image || image.querySelector('img')) return;
  image.classList.add('main-character-fallback');
  const fallback = image.querySelector<HTMLElement>(':scope > span');
  if (fallback) fallback.textContent = 'MC';
}

function ensureBossFallback(root: HTMLElement, raid: NormalizedRaidParse): void {
  const title = root.querySelector<HTMLElement>('.combat-raid-title');
  if (!title || title.querySelector('.combat-boss-icon')) return;
  const label = raid.boss?.name ?? raid.raidName ?? 'Boss';
  const icon = document.createElement('span');
  icon.className = 'combat-boss-icon';
  icon.setAttribute('aria-label', `${label} icon`);
  const image = document.createElement('span');
  image.className = 'combat-image';
  const fallback = document.createElement('span');
  fallback.textContent = combatInitials(label);
  image.append(fallback);
  icon.append(image);
  title.classList.add('has-boss-icon');
  title.prepend(icon);
}

function normalizeSummonPresentation(root: HTMLElement): void {
  for (const strip of root.querySelectorAll<HTMLElement>('.summon-strip')) {
    const cards = [...strip.querySelectorAll<HTMLElement>(':scope > .summon-card')];
    for (const card of cards.slice(6)) card.remove();
    cards[5]?.classList.add('supporter-slot');
  }
}

function findLabeled(root: HTMLElement, selector: string, label: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(selector)].find(
    (element) => element.querySelector<HTMLElement>('span')?.textContent?.trim() === label,
  );
}

function formatActorHp(actor: CombatActorContext): string {
  if (actor.hp === undefined || actor.maxHp === undefined || actor.maxHp <= 0) return 'HP —';
  const percent = actor.hp / actor.maxHp * 100;
  return `${Math.round(actor.hp).toLocaleString('en-US')} (${percent.toFixed(1)}%) / ${Math.round(actor.maxHp).toLocaleString('en-US')}`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function stateLabel(state: MissingRosterActor['state'], originalIndex: number): string {
  if (state === 'dead') return originalIndex >= 4 ? 'Dead · Backline' : 'Dead · Original frontline';
  if (state === 'active') return 'Promoted · Active';
  if (state === 'reserve') return 'Backline · Reserve';
  return 'Observed roster member';
}
