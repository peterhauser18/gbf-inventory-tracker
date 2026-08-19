import { buildCharacterAnalyses, type CharacterCombatAnalysis } from './analytics.ts';
import { renderCombatLayout, type CombatLayoutPreset } from './layouts.ts';
import type { RaidLoadoutMember, RaidLoadoutSnapshot } from './loadout-types.ts';
import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import type { RaidHistoryRecord } from './types.ts';
import { EMPTY_ENTITY_METADATA, type EntityMetadataIndex } from '../dashboard/wiki-metadata.ts';
import { isTechnicalMainCharacterLabel } from './shared-presentation-fixes.ts';

export type RaidWithLoadout = RaidHistoryRecord & { loadout?: RaidLoadoutSnapshot };

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

  const mainAnalysis = matched.get(0);
  const mainCharacterId = mainAnalysis?.actorId ?? actorSlots[0]?.id;
  const persistedMainName = humanFacingPlayerName(members.find((member) => member.position === 0)?.name);
  const observedMainName = mainAnalysis && isTechnicalMainCharacterLabel(mainAnalysis.actorId)
    ? humanFacingPlayerName(mainAnalysis.actorName)
    : undefined;
  const accountDisplayName = persistedMainName ?? observedMainName;
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
  const rendered = renderCombatLayout(layout, {
    raid,
    context: buildHistoricalCombatContext(raid),
    metadata,
    selectedActorId,
    collapsedSections,
  });
  return `${quality}${annotateHistoricalSummons(rendered, raid.loadout)}`;
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
  const candidates = analyses.filter((analysis) => !used.has(analysis.actorId));
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

function annotateHistoricalSummons(markup: string, loadout: RaidLoadoutSnapshot | undefined): string {
  if (!loadout?.summons.some((summon) => summon.support)) return markup;
  let index = 0;
  return markup.replace(/<article class="summon-card">[\s\S]*?<\/article>/g, (card) => {
    const summon = loadout.summons[index++];
    if (!summon?.support) return card;
    return card
      .replace('<article class="summon-card">', '<article class="summon-card support-summon">')
      .replace('</article>', '<span class="state-tag" data-support-summon="true">Support</span></article>');
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}
