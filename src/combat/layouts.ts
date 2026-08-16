import './layouts.css';
import { buildCharacterAnalyses, observedSummonNames, summarizeTurns, type CharacterCombatAnalysis } from './analytics.ts';
import { EMPTY_ENTITY_METADATA, type EntityMetadata, type EntityMetadataIndex } from '../dashboard/wiki-metadata.ts';
import type {
  CombatActorContext,
  CombatParseContext,
  CombatParticipantDisplay,
  CombatSummonContext,
} from './multiraid.ts';
import type { NormalizedRaidParse } from './types.ts';

export type CombatLayoutPreset =
  | 'cypher-modern'
  | 'combat-cockpit'
  | 'party-first'
  | 'analyzer-split'
  | 'compact-live';

export const COMBAT_LAYOUT_PRESETS: ReadonlyArray<readonly [CombatLayoutPreset, string]> = [
  ['cypher-modern', 'Cypher Modern'],
  ['combat-cockpit', 'Combat Cockpit'],
  ['party-first', 'Party First'],
  ['analyzer-split', 'Analyzer Split'],
  ['compact-live', 'Compact Live'],
] as const;

export interface CombatLayoutRenderInput {
  raid: NormalizedRaidParse;
  context?: CombatParseContext | null;
  metadata?: EntityMetadataIndex;
  selectedActorId?: string | null;
  collapsedSections?: ReadonlySet<string>;
}

export function renderCombatLayout(
  preset: CombatLayoutPreset,
  input: CombatLayoutRenderInput,
): string {
  const view = buildView(input);
  switch (preset) {
    case 'combat-cockpit': return renderCockpit(view);
    case 'party-first': return renderPartyFirst(view);
    case 'analyzer-split': return renderAnalyzerSplit(view);
    case 'compact-live': return renderCompactLive(view);
    case 'cypher-modern':
    default: return renderCypherModern(view);
  }
}

interface CombatSummonView extends CombatSummonContext {
  metadata?: EntityMetadata;
}

interface PartyMemberView {
  slot: number;
  actor: CombatActorContext;
  actorId?: string;
  analysis?: CharacterCombatAnalysis;
  metadata?: EntityMetadata;
  label: string;
  state: 'active' | 'dead' | 'replacement' | 'inactive';
}

interface CombatView {
  raid: NormalizedRaidParse;
  context: CombatParseContext | null;
  metadata: EntityMetadataIndex;
  analyses: CharacterCombatAnalysis[];
  selected: CharacterCombatAnalysis | undefined;
  turns: ReturnType<typeof summarizeTurns>;
  participantRows: CombatParticipantDisplay[];
  summons: CombatSummonView[];
  collapsed: ReadonlySet<string>;
}

function buildView(input: CombatLayoutRenderInput): CombatView {
  const metadata = input.metadata ?? EMPTY_ENTITY_METADATA;
  const context = input.context ?? null;
  const analyses = buildCharacterAnalyses(input.raid);
  const selected = analyses.find((entry) => entry.actorId === input.selectedActorId) ?? analyses[0];
  const summons = (context?.summons ?? []).map((summon) => ({
    ...summon,
    metadata: summonMetadata(metadata, summon),
  }));
  for (const name of observedSummonNames(input.raid)) {
    const normalized = name.trim().toLowerCase();
    if (summons.some((summon) => summon.name?.trim().toLowerCase() === normalized)) continue;
    summons.push({ name, used: true, metadata: findMetadataByName(metadata.summons, name) });
  }
  return {
    raid: input.raid,
    context,
    metadata,
    analyses,
    selected,
    turns: summarizeTurns(input.raid, context?.turn),
    participantRows: context?.participants ?? [],
    summons,
    collapsed: input.collapsedSections ?? new Set(),
  };
}

function renderCypherModern(view: CombatView): string {
  return `<div class="combat-preset preset-cypher-modern">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="preset-cypher-grid">
      <div class="preset-main-column">
        ${accordion(view, 'party', 'Party', renderPartyCards(view, 'large'))}
        ${accordion(view, 'analysis', 'Party Analysis', renderSelectedAnalysis(view, 'wide'))}
      </div>
      ${accordion(view, 'summons', 'Summons', renderSummonsPanel(view, 'sidebar'))}
    </div>
    ${accordion(view, 'participants', 'Participants', renderParticipantsTable(view))}
    ${accordion(view, 'log', 'Combat Log', renderLog(view))}
  </div>`;
}

function renderCockpit(view: CombatView): string {
  return `<div class="combat-preset preset-combat-cockpit">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    ${accordion(view, 'party', 'Party & inline analysis', renderCockpitTable(view))}
    ${accordion(view, 'summons', 'Summons', renderSummonsPanel(view, 'strip'))}
    <div class="preset-bottom-split">${accordion(view, 'participants', 'Participants', renderParticipantsTable(view))}${accordion(view, 'log', 'Combat Log', renderLog(view))}</div>
  </div>`;
}

function renderPartyFirst(view: CombatView): string {
  return `<div class="combat-preset preset-party-first">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="party-first-row">
      ${accordion(view, 'party', 'Party', renderPartyCards(view, 'hero'))}
      ${accordion(view, 'summons', 'Summons', renderSummonsPanel(view, 'sidebar'))}
    </div>
    ${accordion(view, 'analysis', 'Party Analysis', renderSelectedAnalysis(view, 'wide'))}
    <div class="preset-bottom-split">${accordion(view, 'participants', 'Participants', renderParticipantsTable(view))}${accordion(view, 'log', 'Combat Log', renderLog(view))}</div>
  </div>`;
}

function renderAnalyzerSplit(view: CombatView): string {
  return `<div class="combat-preset preset-analyzer-split">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="analyzer-split-grid">
      <div>${accordion(view, 'party', 'Party', renderPartyCards(view, 'stacked'))}${accordion(view, 'summons', 'Summons', renderSummonsPanel(view, 'strip'))}</div>
      ${accordion(view, 'analysis', 'Selected character analysis', renderSelectedAnalysis(view, 'deep'))}
    </div>
    <div class="preset-bottom-split">${accordion(view, 'participants', 'Participants', renderParticipantsTable(view))}${accordion(view, 'log', 'Combat Log', renderLog(view))}</div>
  </div>`;
}

function renderCompactLive(view: CombatView): string {
  return `<div class="combat-preset preset-compact-live">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="compact-party-summons">${renderPartyCards(view, 'compact')}${renderSummonsPanel(view, 'strip')}</div>
    ${accordion(view, 'analysis', 'Party Analysis', renderSelectedAnalysis(view, 'wide'))}
    ${accordion(view, 'participants', 'Participants', renderParticipantsTable(view))}
    ${accordion(view, 'log', 'Combat Log', renderLog(view))}
    ${accordion(view, 'graphs', 'Graphs', '<p class="muted">Reserved for future deterministic graph views.</p>')}
  </div>`;
}

function renderRaidHeader(view: CombatView): string {
  const raid = view.raid;
  const hp = raid.boss?.hp;
  const maxHp = raid.boss?.maxHp;
  const percent = raid.boss?.hpPercent ?? (hp !== undefined && maxHp !== undefined && maxHp > 0 ? hp / maxHp * 100 : undefined);
  return `<section class="combat-raid-header">
    <div class="combat-raid-title"><span class="raid-result ${escapeAttribute(raid.result)}">${escapeHtml(raid.result)}</span><h3>${escapeHtml(raid.raidName ?? raid.raidTechnicalId)}</h3></div>
    <div class="combat-header-facts">
      ${headerFact('Turn', view.turns.currentTurn === undefined ? '—' : String(view.turns.currentTurn))}
      ${headerFact('Duration', formatDuration(raid.durationMs))}
      ${headerFact('Role', raid.role ?? '—')}
    </div>
    <div class="boss-hp-wide">
      <div><span>Boss HP</span><strong>${hp === undefined ? '—' : `${formatNumber(hp)}${maxHp === undefined ? '' : ` / ${formatNumber(maxHp)}`}`}</strong><span>${percent === undefined ? '—' : `${percent.toFixed(1)}%`}</span></div>
      <div class="hp-track" aria-hidden="true"><span style="width:${clampPercent(percent)}%"></span></div>
    </div>
  </section>`;
}

function renderLiveStats(view: CombatView): string {
  const raid = view.raid;
  const self = ownParticipant(view);
  const exactHonors = self?.honors ?? raid.participants?.honors;
  const honors = exactHonors !== undefined
    ? formatNumber(exactHonors)
    : raid.participants?.contribution !== undefined
      ? `≈ ${formatNumber(raid.participants.contribution)} (estimated)`
      : '—';
  const participantCount = raid.participants?.count;
  const participants = participantCount !== undefined
    ? `${formatNumber(participantCount)} / 30`
    : view.participantRows.length > 0
      ? `${formatNumber(view.participantRows.length)}+ observed`
      : '—';
  const average = raid.coverage.startObserved && view.turns.currentTurn !== undefined && view.turns.currentTurn > 0 && raid.partyDamage !== undefined
    ? raid.partyDamage / view.turns.currentTurn
    : undefined;
  return `<section class="combat-live-stats">
    ${liveStat('Party Damage', optionalNumber(raid.partyDamage))}
    ${liveStat('Previous Turn', optionalNumber(view.turns.previousTurnDamage))}
    ${liveStat('Current Turn', optionalNumber(view.turns.currentTurnDamage))}
    ${liveStat('Average / Turn', optionalNumber(average))}
    ${liveStat('Honors', honors)}
    ${liveStat('Participants', participants)}
  </section>`;
}

function renderPartyCards(view: CombatView, size: 'large' | 'hero' | 'stacked' | 'compact'): string {
  const members = partyMembers(view);
  if (!members.length) return '<p class="muted">No verified party snapshot observed yet.</p>';
  return `<section class="party-cards party-cards-${size}">${members.map((member) => {
    const selected = member.actorId !== undefined && view.selected?.actorId === member.actorId;
    const select = member.actorId ? ` data-character-select="${escapeAttribute(member.actorId)}"` : '';
    const damage = member.analysis ? `${formatNumber(member.analysis.totalDamage)} dmg` : 'Damage —';
    const backline = member.slot >= 4;
    return `<button type="button" class="party-card ${selected ? 'selected' : ''} ${member.state}"${select}>
      <span class="party-card-visual">${renderImage(member.metadata?.imageUrl, member.label)}</span>
      <span class="party-card-copy"><strong>${escapeHtml(member.label)}</strong>
        ${renderHp(member.actor)}
        <span class="party-card-damage">${damage}</span>
        ${member.state === 'dead' ? '<span class="state-tag danger">Dead</span>' : member.state === 'replacement' ? '<span class="state-tag">Replacement</span>' : backline ? '<span class="state-tag">Backline</span>' : ''}
      </span>
      <span class="party-slot">${backline ? `B${member.slot - 3}` : member.slot + 1}</span>
    </button>`;
  }).join('')}</section>`;
}

function renderCockpitTable(view: CombatView): string {
  const members = partyMembers(view);
  if (!members.length) return '<p class="muted">No verified party snapshot observed yet.</p>';
  return `<section class="cockpit-table">
    <div class="cockpit-row cockpit-head"><span>Character</span><span>Total</span><span>Normal</span><span>Skill</span><span>Ougi</span><span>Echo</span><span>Supp.</span><span>Crit</span></div>
    ${members.map((member) => {
      const analysis = member.analysis;
      const selected = member.actorId !== undefined && view.selected?.actorId === member.actorId;
      const select = member.actorId ? ` data-character-select="${escapeAttribute(member.actorId)}"` : '';
      return `<button type="button" class="cockpit-row ${selected ? 'selected' : ''}"${select}>
        <span class="cockpit-character">${renderImage(member.metadata?.imageUrl, member.label)}<span><strong>${escapeHtml(member.label)}</strong>${renderHp(member.actor)}</span></span>
        <strong>${analysis ? formatNumber(analysis.totalDamage) : '—'}</strong><span>${optionalNumber(analysis?.breakdown.normal)}</span><span>${optionalNumber(analysis?.breakdown.skill)}</span><span>${optionalNumber(analysis?.breakdown.ougi)}</span><span>${optionalNumber(analysis?.breakdown.echo)}</span><span>${optionalNumber(analysis?.breakdown.supplemental)}</span><span>${formatPercent(analysis?.criticalRate)}</span>
      </button>${selected && analysis ? `<div class="cockpit-inline-detail">${renderSelectedAnalysis(view, 'inline')}</div>` : ''}`;
    }).join('')}
  </section>`;
}

function renderSelectedAnalysis(view: CombatView, mode: 'wide' | 'deep' | 'inline'): string {
  const analysis = view.selected;
  if (!analysis) return '<section class="character-analysis"><p class="muted">Select a character after supported damage is observed.</p></section>';
  const actor = actorFor(view.context, analysis.actorId);
  const metadata = characterMetadata(view.metadata, analysis.actorId, analysis.actorName ?? actor?.name);
  const label = actorDisplayName(view, analysis.actorId, analysis.actorName, actor, metadata);
  const attackModeSamples = (analysis.single?.count ?? 0) + (analysis.double?.count ?? 0) + (analysis.triple?.count ?? 0);
  return `<section class="character-analysis analysis-${mode}">
    <div class="analysis-character"><span class="analysis-portrait">${renderImage(metadata?.imageUrl, label)}</span><div><p class="eyebrow">SELECTED CHARACTER</p><h3>${escapeHtml(label)}</h3>${renderHp(actor)}<strong>${formatNumber(analysis.totalDamage)} total damage</strong></div></div>
    <div class="analysis-breakdown">
      ${analysisMetric('Normal', analysis.breakdown.normal)}${analysisMetric('Skill', analysis.breakdown.skill)}${analysisMetric('Ougi', analysis.breakdown.ougi)}${analysisMetric('Echo', analysis.breakdown.echo)}${analysisMetric('Supplemental', analysis.breakdown.supplemental)}${analysisMetric('Unclassified', analysis.breakdown.other)}
    </div>
    <div class="attack-mode-grid">
      ${attackMode('SA', analysis.single, attackModeSamples)}${attackMode('DA', analysis.double, attackModeSamples)}${attackMode('TA', analysis.triple, attackModeSamples)}
      <div class="analysis-stat"><span>Crit rate</span><strong>${formatPercent(analysis.criticalRate)}</strong><small>${analysis.criticalHits === undefined || analysis.criticalDenominator === undefined ? 'denominator unavailable' : `${analysis.criticalHits}/${analysis.criticalDenominator} observed hits`}</small></div>
      <div class="analysis-stat"><span>Ougi</span><strong>${analysis.ougiUses}</strong><small>${formatNumber(analysis.ougiDamage)} damage</small></div>
    </div>
    ${renderSkillTable(analysis)}
  </section>`;
}

function renderSkillTable(analysis: CharacterCombatAnalysis): string {
  if (!analysis.skills.length) return '<div class="skill-breakdown"><p class="muted">No damaging skills attributed to this character yet.</p></div>';
  return `<div class="skill-breakdown"><div class="skill-row skill-head"><span>Skill</span><span>Uses</span><span>Damage</span><span>Average</span></div>${analysis.skills.map((skill) => `<div class="skill-row"><strong>${escapeHtml(skill.name)}</strong><span>${skill.uses}</span><span>${formatNumber(skill.damage)}</span><span>${formatNumber(skill.damage / skill.uses)}</span></div>`).join('')}</div>`;
}

function renderSummonsPanel(view: CombatView, mode: 'sidebar' | 'strip'): string {
  return `<section class="summon-panel summon-panel-${mode}"><div class="section-title"><p class="eyebrow">SUMMONS</p><h3>Party summons</h3></div>${renderSummonStrip(view)}</section>`;
}

function renderSummonStrip(view: CombatView): string {
  if (!view.summons.length) return '<p class="muted">Party summon roster has not been observed in a verified response yet.</p>';
  return `<div class="summon-strip">${view.summons.map((summon, index) => {
    const label = summon.metadata?.name ?? summon.name ?? `Summon ${index + 1}`;
    return `<article class="summon-card">${renderImage(summon.metadata?.imageUrl, label)}<strong>${escapeHtml(label)}</strong><span>${escapeHtml(summonStatus(summon))}</span></article>`;
  }).join('')}</div>`;
}

function renderParticipantsTable(view: CombatView): string {
  if (!view.participantRows.length) {
    const count = view.raid.participants?.count;
    return `<p class="muted">${count === undefined ? 'No participant snapshot observed yet; GBF Tracker does not request the Players list.' : `${formatNumber(count)} participants observed; detailed rows were not included in an already-received response.`}</p>`;
  }
  return `<div class="participant-grid"><div class="participant-grid-row head"><span>#</span><span>Player</span><span>Rank</span><span>Honors</span><span>HP</span><span>Status</span></div>${view.participantRows.slice(0, 30).map((participant) => `<div class="participant-grid-row"><strong>${participant.placement === undefined ? '—' : `#${participant.placement}`}</strong><span>${escapeHtml(participant.name)}</span><span>${optionalNumber(participant.level)}</span><span>${optionalNumber(participant.honors)}</span><span>${participant.hpPercent === undefined ? '—' : `${participant.hpPercent.toFixed(1)}%`}</span><span>${escapeHtml(participantStatus(participant))}</span></div>`).join('')}</div>`;
}

function renderLog(view: CombatView): string {
  if (!view.raid.log.length) return '<p class="muted">No supported actions observed.</p>';
  return `<div class="combat-timeline">${view.raid.log.slice(-80).reverse().map((entry) => {
    const actor = entry.actorId ? actorFor(view.context, entry.actorId) : undefined;
    const metadata = entry.actorId ? characterMetadata(view.metadata, entry.actorId, entry.actorName ?? actor?.name) : undefined;
    const label = entry.actorId
      ? actorDisplayName(view, entry.actorId, entry.actorName, actor, metadata)
      : entry.actorName ?? 'Actor unavailable';
    return `<div class="combat-timeline-row"><span>${entry.turn === undefined ? 'T—' : `T${entry.turn}`}</span><strong>${escapeHtml(label)}</strong><span>${escapeHtml(entry.actionName ?? entry.actionKind)}</span><span>${formatNumber(entry.damage)}</span></div>`;
  }).join('')}</div>`;
}

function partyMembers(view: CombatView): PartyMemberView[] {
  const slots = view.context?.actorSlots ?? [];
  if (slots.some((actor) => actor.id || actor.name || actor.hp !== undefined)) {
    return slots.slice(0, 6).flatMap((actor, slot) => {
      if (!actor.id && !actor.name && actor.hp === undefined && actor.maxHp === undefined) return [];
      const analysis = actor.id ? view.analyses.find((entry) => entry.actorId === actor.id) : undefined;
      const metadata = actor.id ? characterMetadata(view.metadata, actor.id, analysis?.actorName ?? actor.name) : undefined;
      const label = actor.id
        ? actorDisplayName(view, actor.id, analysis?.actorName, actor, metadata, slot)
        : actor.name ?? (slot === 0 ? view.context?.accountDisplayName ?? 'Main Character' : `Party member ${slot + 1}`);
      return [{
        slot,
        actor,
        actorId: actor.id,
        analysis,
        metadata,
        label,
        state: actor.id ? actorState(view.context, actor.id) : slot < 4 ? 'active' : 'inactive',
      }];
    });
  }

  return view.analyses.map((analysis, slot) => {
    const actor = actorFor(view.context, analysis.actorId) ?? {};
    const metadata = characterMetadata(view.metadata, analysis.actorId, analysis.actorName ?? actor.name);
    return {
      slot,
      actor,
      actorId: analysis.actorId,
      analysis,
      metadata,
      label: actorDisplayName(view, analysis.actorId, analysis.actorName, actor, metadata, slot),
      state: actorState(view.context, analysis.actorId),
    };
  });
}

function actorDisplayName(
  view: CombatView,
  actorId: string,
  observedName?: string,
  actor?: CombatActorContext,
  metadata?: EntityMetadata,
  slot?: number,
): string {
  const mainCharacter = actorId === view.context?.mainCharacterId || slot === 0 && actorId === view.context?.actorSlots[0]?.id;
  if (mainCharacter) return view.context?.accountDisplayName ?? 'Main Character';
  return metadata?.name ?? observedName ?? actor?.name ?? (slot === undefined ? 'Party member' : `Party member ${slot + 1}`);
}

function ownParticipant(view: CombatView): CombatParticipantDisplay | undefined {
  const accountName = view.context?.accountDisplayName?.trim().toLowerCase();
  if (!accountName) return undefined;
  const matches = view.participantRows.filter((participant) => participant.name.trim().toLowerCase() === accountName);
  return matches.length === 1 ? matches[0] : undefined;
}

function summonMetadata(index: EntityMetadataIndex, summon: CombatSummonContext): EntityMetadata | undefined {
  return (summon.id ? index.summons.get(summon.id) : undefined)
    ?? (summon.name ? findMetadataByName(index.summons, summon.name) : undefined);
}

function summonStatus(summon: CombatSummonContext): string {
  if (summon.cooldown !== undefined) return summon.cooldown === 0 ? 'Ready' : `Cooldown ${formatNumber(summon.cooldown)}`;
  if (summon.available === true) return 'Ready';
  if (summon.available === false) return 'Unavailable';
  if (summon.used) return 'Used · cooldown not observed';
  return 'Observed in party';
}

function accordion(view: CombatView, key: string, label: string, body: string): string {
  const open = !view.collapsed.has(key);
  return `<details class="combat-accordion" data-combat-collapse="${escapeAttribute(key)}"${open ? ' open' : ''}><summary>${escapeHtml(label)}</summary><div>${body}</div></details>`;
}

function headerFact(label: string, value: string): string {
  return `<div class="header-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function liveStat(label: string, value: string): string {
  return `<div class="live-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function analysisMetric(label: string, value: number | undefined): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${optionalNumber(value)}</strong></div>`;
}

function attackMode(label: string, value: { count: number; damage: number } | undefined, denominator: number): string {
  if (denominator <= 0) {
    return `<div class="analysis-stat"><span>${label}</span><strong>—</strong><small>not source-proven</small></div>`;
  }
  const count = value?.count ?? 0;
  const damage = value?.damage ?? 0;
  return `<div class="analysis-stat"><span>${label}</span><strong>${count} · ${formatPercent(count / denominator)}</strong><small>${denominator} source-proven attacks · ${formatNumber(damage)} damage</small></div>`;
}

function renderHp(actor: CombatActorContext | undefined): string {
  if (actor?.hp === undefined || actor.maxHp === undefined || actor.maxHp <= 0) return '<span class="actor-hp muted">HP —</span>';
  const percent = actor.hp / actor.maxHp * 100;
  return `<span class="actor-hp"><span class="mini-hp"><i style="width:${clampPercent(percent)}%"></i></span><span>${formatNumber(actor.hp)} (${percent.toFixed(1)}%) / ${formatNumber(actor.maxHp)}</span></span>`;
}

function renderImage(url: string | undefined, label: string): string {
  const initials = label.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
  return `<span class="combat-image"><span>${escapeHtml(initials)}</span>${url ? `<img data-combat-image src="${escapeAttribute(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : ''}</span>`;
}

function actorFor(context: CombatParseContext | null, actorId: string): CombatActorContext | undefined {
  return context?.actors?.find((actor) => actor.id === actorId)
    ?? context?.actorSlots.find((actor) => actor.id === actorId);
}

function actorState(context: CombatParseContext | null, actorId: string): 'active' | 'dead' | 'replacement' | 'inactive' {
  const actor = actorFor(context, actorId);
  if (actor?.alive === false) return 'dead';
  const active = context?.actorSlots.slice(0, 4).some((slot) => slot.id === actorId) ?? false;
  if (!active) return 'inactive';
  const originalIndex = context?.actors?.findIndex((entry) => entry.id === actorId) ?? -1;
  return originalIndex >= 4 ? 'replacement' : 'active';
}

function characterMetadata(index: EntityMetadataIndex, actorId: string, actorName?: string): EntityMetadata | undefined {
  return index.characters.get(actorId) ?? (actorName ? findMetadataByName(index.characters, actorName) : undefined);
}

function findMetadataByName(index: ReadonlyMap<string, EntityMetadata>, name: string): EntityMetadata | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const metadata of index.values()) {
    if (metadata.name.toLowerCase() === normalized || metadata.wikiTitle.toLowerCase() === normalized) return metadata;
  }
  return undefined;
}

function participantStatus(participant: CombatParticipantDisplay): string {
  const values = [participant.host ? 'Host' : undefined, participant.status];
  return values.filter((value): value is string => Boolean(value)).join(' · ') || '—';
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? '—' : formatNumber(value);
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function clampPercent(value: number | undefined): number {
  return value === undefined ? 0 : Math.max(0, Math.min(100, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
