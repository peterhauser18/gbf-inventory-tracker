import { buildCharacterAnalyses, type CharacterCombatAnalysis } from './analytics.ts';
import { renderCombatLayout, type CombatLayoutPreset } from './layouts.ts';
import type { RaidLoadoutMember, RaidLoadoutSnapshot } from './loadout-types.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import { getRaidHistory } from './storage.ts';
import type { RaidHistoryRecord } from './types.ts';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadataIndex,
} from '../dashboard/wiki-metadata.ts';
import { applySharedCombatPresentationFixes, isTechnicalMainCharacterLabel } from './shared-presentation-fixes.ts';

type RaidWithLoadout = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

const selectedActorByRaid = new Map<string, string>();
const collapsedSectionsByRaid = new Map<string, Set<string>>();
let metadataPromise: Promise<EntityMetadataIndex> | undefined;

export async function decorateHistoricalRaidLayouts(
  root: HTMLElement,
  layout: CombatLayoutPreset,
): Promise<void> {
  const [history, metadata] = await Promise.all([
    getRaidHistory() as Promise<RaidWithLoadout[]>,
    getMetadata(),
  ]);
  const byLocalId = new Map(history.map((raid) => [raid.localId, raid]));

  for (const card of root.querySelectorAll<HTMLElement>('.raid-card')) {
    const localId = card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport;
    if (!localId) continue;
    const raid = byLocalId.get(localId);
    if (!raid) continue;
    renderHistoryCard(card, raid, layout, metadata);
  }
}

export function buildHistoricalCombatContext(raid: RaidWithLoadout): CombatParseContext | null {
  const loadout = raid.loadout;
  if (!loadout) return null;

  const analyses = buildCharacterAnalyses(raid);
  const members = [...loadout.party].sort((left, right) => left.position - right.position);
  const matched = matchHistoricalAnalyses(members, analyses);
  const highestPosition = members.reduce((max, member) => Math.max(max, member.position), -1);
  const actorSlots: CombatActorContext[] = Array.from({ length: highestPosition + 1 }, () => ({}));

  for (const member of members) {
    if (!Number.isInteger(member.position) || member.position < 0 || member.position >= actorSlots.length) continue;
    const analysis = matched.get(member.position);
    const actorId = analysis?.actorId ?? member.id;
    actorSlots[member.position] = {
      id: actorId,
      name: member.position === 0 ? humanFacingPlayerName(member.name) : humanFacingCharacterName(member.name),
    };
  }

  const mainCharacterId = matched.get(0)?.actorId ?? actorSlots[0]?.id;
  const accountDisplayName = humanFacingPlayerName(members.find((member) => member.position === 0)?.name);
  return {
    raidTechnicalId: raid.raidTechnicalId,
    instanceId: raid.instanceId,
    actorSlots,
    actors: actorSlots.filter((actor) => actor.id || actor.name).map((actor) => ({ ...actor })),
    mainCharacterId,
    accountDisplayName,
    turn: raid.lastObservedTurn,
    summons: loadout.summons.map((summon) => ({ id: summon.id, name: summon.name })),
  };
}

export function renderHistoricalRaidLayout(
  raid: RaidWithLoadout,
  layout: CombatLayoutPreset,
  metadata: EntityMetadataIndex = EMPTY_ENTITY_METADATA,
  selectedActorId: string | null = null,
  collapsedSections: ReadonlySet<string> = new Set(),
): string {
  const quality = renderHistoricalQuality(raid.loadout);
  return `${quality}${renderCombatLayout(layout, {
    raid,
    context: buildHistoricalCombatContext(raid),
    metadata,
    selectedActorId,
    collapsedSections,
  })}`;
}

function renderHistoryCard(
  card: HTMLElement,
  raid: RaidWithLoadout,
  layout: CombatLayoutPreset,
  metadata: EntityMetadataIndex,
): void {
  const mount = card.querySelector<HTMLElement>('[data-raid-combat-collapse] .raid-section-body');
  if (!mount) return;

  let host = mount.querySelector<HTMLElement>(':scope > [data-history-layout-host]');
  if (!host) {
    const preservedLoadouts = [...mount.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('combat-loadout-section'));
    host = document.createElement('div');
    host.dataset.historyLayoutHost = raid.localId;
    mount.replaceChildren(...preservedLoadouts, host);
  }

  const collapsed = collapsedSectionsByRaid.get(raid.localId) ?? new Set<string>();
  const selectedActorId = selectedActorByRaid.get(raid.localId) ?? null;
  const fingerprint = [
    layout,
    raid.lastObservedAt,
    raid.loadout?.updatedAt ?? 0,
    selectedActorId ?? '',
    [...collapsed].sort().join(','),
  ].join(':');
  if (host.dataset.historyLayoutFingerprint === fingerprint) return;

  host.dataset.historyLayoutFingerprint = fingerprint;
  host.innerHTML = renderHistoricalRaidLayout(raid, layout, metadata, selectedActorId, collapsed);
  annotateHistoricalSummons(host, raid.loadout);
  applySharedCombatPresentationFixes(host);

  host.querySelectorAll<HTMLButtonElement>('[data-character-select]').forEach((button) => {
    button.addEventListener('click', () => {
      const actorId = button.dataset.characterSelect;
      if (!actorId) return;
      selectedActorByRaid.set(raid.localId, actorId);
      host!.dataset.historyLayoutFingerprint = '';
      renderHistoryCard(card, raid, layout, metadata);
    });
  });

  host.querySelectorAll<HTMLDetailsElement>('[data-combat-collapse]').forEach((details) => {
    details.addEventListener('toggle', () => {
      const section = details.dataset.combatCollapse;
      if (!section) return;
      const current = collapsedSectionsByRaid.get(raid.localId) ?? new Set<string>();
      if (details.open) current.delete(section);
      else current.add(section);
      collapsedSectionsByRaid.set(raid.localId, current);
    });
  });
}

function matchHistoricalAnalyses(
  members: readonly RaidLoadoutMember[],
  analyses: readonly CharacterCombatAnalysis[],
): Map<number, CharacterCombatAnalysis> {
  const matches = new Map<number, CharacterCombatAnalysis>();
  const used = new Set<string>();

  for (const member of members.filter((entry) => entry.position !== 0)) {
    const memberName = normalizedName(humanFacingCharacterName(member.name));
    const match = analyses.find((analysis) => {
      if (used.has(analysis.actorId)) return false;
      if (member.id && analysis.actorId === member.id) return true;
      const analysisName = normalizedName(humanFacingCharacterName(analysis.actorName));
      return Boolean(memberName && analysisName && memberName === analysisName);
    });
    if (!match) continue;
    matches.set(member.position, match);
    used.add(match.actorId);
  }

  const main = members.find((member) => member.position === 0);
  if (!main) return matches;
  const mainName = normalizedName(humanFacingPlayerName(main.name));
  let candidates = analyses.filter((analysis) => !used.has(analysis.actorId));
  let match = mainName
    ? candidates.find((analysis) => normalizedName(humanFacingPlayerName(analysis.actorName)) === mainName)
    : undefined;
  if (!match) {
    const technical = candidates.filter((analysis) =>
      isTechnicalMainCharacterLabel(analysis.actorId) || isTechnicalMainCharacterLabel(analysis.actorName));
    if (technical.length === 1) match = technical[0];
  }
  if (!match && candidates.length === 1) match = candidates[0];
  if (match) matches.set(0, match);
  return matches;
}

function renderHistoricalQuality(loadout: RaidLoadoutSnapshot | undefined): string {
  if (!loadout) {
    return '<p class="muted history-data-quality">Historical party and summon loadout unavailable for this older record.</p>';
  }
  const notices: string[] = [];
  if (loadout.partyQuality !== 'known') notices.push(`Party ${loadout.partyQuality}`);
  if (loadout.summonQuality !== 'known') notices.push(`Summons ${loadout.summonQuality}`);
  if (!notices.length) return '';
  return `<p class="muted history-data-quality">Historical data: ${escapeHtml(notices.join(' · '))}. Missing slots are not inferred.</p>`;
}

function annotateHistoricalSummons(host: HTMLElement, loadout: RaidLoadoutSnapshot | undefined): void {
  if (!loadout?.summons.length) return;
  const cards = [...host.querySelectorAll<HTMLElement>('.summon-card')];
  loadout.summons.forEach((summon, index) => {
    if (!summon.support) return;
    const card = cards[index];
    if (!card || card.querySelector('[data-support-summon]')) return;
    const badge = document.createElement('span');
    badge.className = 'state-tag';
    badge.dataset.supportSummon = 'true';
    badge.textContent = 'Support';
    card.append(badge);
  });
}

function humanFacingPlayerName(value: string | undefined): string | undefined {
  const text = humanFacingCharacterName(value);
  if (!text || /^(?:mc|main character)$/i.test(text)) return undefined;
  return text;
}

function humanFacingCharacterName(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text || isTechnicalMainCharacterLabel(text)) return undefined;
  return text;
}

function normalizedName(value: string | undefined): string | undefined {
  const text = value?.trim().toLocaleLowerCase();
  return text || undefined;
}

async function getMetadata(): Promise<EntityMetadataIndex> {
  metadataPromise ??= loadWikiEntityMetadata().catch(() => EMPTY_ENTITY_METADATA);
  return metadataPromise;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}
