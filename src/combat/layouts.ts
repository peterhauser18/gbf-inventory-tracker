import './layouts.css';
import { buildCharacterAnalyses, observedSummonNames, summarizeTurns, type CharacterCombatAnalysis } from './analytics.ts';
import { EMPTY_ENTITY_METADATA, type EntityMetadata, type EntityMetadataIndex } from '../dashboard/wiki-metadata.ts';
import type { CombatActorContext, CombatParseContext, CombatParticipantDisplay } from './multiraid.ts';
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

interface CombatView {
  raid: NormalizedRaidParse;
  context: CombatParseContext | null;
  metadata: EntityMetadataIndex;
  analyses: CharacterCombatAnalysis[];
  selected: CharacterCombatAnalysis | undefined;
  turns: ReturnType<typeof summarizeTurns>;
  participantRows: CombatParticipantDisplay[];
  summons: EntityMetadata[];
  collapsed: ReadonlySet<string>;
}

function buildView(input: CombatLayoutRenderInput): CombatView {
  const metadata = input.metadata ?? EMPTY_ENTITY_METADATA;
  const analyses = buildCharacterAnalyses(input.raid);
  const selected = analyses.find((entry) => entry.actorId === input.selectedActorId) ?? analyses[0];
  const summonNames = observedSummonNames(input.raid);
  return {
    raid: input.raid,
    context: input.context ?? null,
    metadata,
    analyses,
    selected,
    turns: summarizeTurns(input.raid),
    participantRows: input.context?.participants ?? [],
    summons: summonNames.flatMap((name) => {
      const match = findMetadataByName(metadata.summons, name);
      return match ? [match] : [];
    }),
    collapsed: input.collapsedSections ?? new Set(),
  };
}

function renderCypherModern(view: CombatView): string {
  return `<div class="combat-preset preset-cypher-modern">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="preset-cypher-grid">
      <div class="preset-main-column">
        ${renderPartyCards(view, 'large')}
        ${renderSelectedAnalysis(view, 'wide')}
      </div>
      ${renderSummonsPanel(view, 'sidebar')}
    </div>
    ${renderParticipantsPanel(view)}
    ${renderLogPanel(view)}
  </div>`;
}

function renderCockpit(view: CombatView): string {
  return `<div class="combat-preset preset-combat-cockpit">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    ${renderCockpitTable(view)}
    ${renderSummonsPanel(view, 'strip')}
    <div class="preset-bottom-split">${renderParticipantsPanel(view)}${renderLogPanel(view)}</div>
  </div>`;
}

function renderPartyFirst(view: CombatView): string {
  return `<div class="combat-preset preset-party-first">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="party-first-row">
      ${renderPartyCards(view, 'hero')}
      ${renderSummonsPanel(view, 'sidebar')}
    </div>
    ${renderSelectedAnalysis(view, 'wide')}
    <div class="preset-bottom-split">${renderParticipantsPanel(view)}${renderLogPanel(view)}</div>
  </div>`;
}

function renderAnalyzerSplit(view: CombatView): string {
  return `<div class="combat-preset preset-analyzer-split">
    ${renderRaidHeader(view)}
    ${renderLiveStats(view)}
    <div class="analyzer-split-grid">
      <div>${renderPartyCards(view, 'stacked')}${renderSummonsPanel(view, 'strip')}</div>
      ${renderSelectedAnalysis(view, 'deep')}
    </div>
    <div class="preset-bottom-split">${renderParticipantsPanel(view)}${renderLogPanel(view)}</div>
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
    ${accordion(view, 'summons', 'Summons', renderSummonStrip(view))}
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
  const honors = raid.participants?.honors ?? raid.participants?.contribution;
  const average = raid.coverage.startObserved && view.turns.currentTurn && raid.partyDamage !== undefined
    ? raid.partyDamage / view.turns.currentTurn
    : undefined;
  return `<section class="combat-live-stats">
    ${liveStat('Party Damage', optionalNumber(raid.partyDamage))}
    ${liveStat('Previous Turn', optionalNumber(view.turns.previousTurnDamage))}
    ${liveStat('Current Turn', optionalNumber(view.turns.currentTurnDamage))}
    ${liveStat('Average / Turn', optionalNumber(average))}
    ${liveStat('Honors', optionalNumber(honors))}
    ${liveStat('Participants', raid.participants?.count === undefined ? '—' : `${formatNumber(raid.participants.count)} / 30`)}
  </section>`;
}

function renderPartyCards(view: CombatView, size: 'large' | 'hero' | 'stacked' | 'compact'): string {
  if (!view.analyses.length) return '<p class="muted">No supported character damage observed yet.</p>';
  return `<section class="party-cards party-cards-${size}">${view.analyses.map((analysis, index) => {
    const actor = actorFor(view.context, analysis.actorId);
    const metadata = characterMetadata(view.metadata, analysis.actorId, analysis.actorName ?? actor?.name);
    const state = actorState(view.context, analysis.actorId);
    const selected = view.selected?.actorId === analysis.actorId;
    return `<button type="button" class="party-card ${selected ? 'selected' : ''} ${state}" data-character-select="${escapeAttribute(analysis.actorId)}">
      <span class="party-card-visual">${renderImage(metadata?.imageUrl, metadata?.name ?? analysis.actorName ?? analysis.actorId)}</span>
      <span class="party-card-copy"><strong>${escapeHtml(metadata?.name ?? analysis.actorName ?? actor?.name ?? analysis.actorId)}</strong>
        ${renderHp(actor)}
        <span class="party-card-damage">${formatNumber(analysis.totalDamage)} dmg</span>
        ${state === 'dead' ? '<span class="state-tag danger">Dead</span>' : state === 'replacement' ? '<span class="state-tag">Replacement</span>' : ''}
      </span>
      <span class="party-slot">${index + 1}</span>
    </button>`;
  }).join('')}</section>`;
}

function renderCockpitTable(view: CombatView): string {
  if (!view.analyses.length) return '<p class="muted">No supported character damage observed yet.</p>';
  return `<section class="cockpit-table">
    <div class="cockpit-row cockpit-head"><span>Character</span><span>Total</span><span>Normal</span><span>Skill</span><span>Ougi</span><span>Echo</span><span>Supp.</span><span>Crit</span></div>
    ${view.analyses.map((analysis) => {
      const actor = actorFor(view.context, analysis.actorId);
      const metadata = characterMetadata(view.metadata, analysis.actorId, analysis.actorName ?? actor?.name);
      const selected = view.selected?.actorId === analysis.actorId;
      return `<button type="button" class="cockpit-row ${selected ? 'selected' : ''}" data-character-select="${escapeAttribute(analysis.actorId)}">
        <span class="cockpit-character">${renderImage(metadata?.imageUrl, metadata?.name ?? analysis.actorName ?? analysis.actorId)}<span><strong>${escapeHtml(metadata?.name ?? analysis.actorName ?? actor?.name ?? analysis.actorId)}</strong>${renderHp(actor)}</span></span>
        <strong>${formatNumber(analysis.totalDamage)}</strong><span>${optionalNumber(analysis.breakdown.normal)}</span><span>${optionalNumber(analysis.breakdown.skill)}</span><span>${optionalNumber(analysis.breakdown.ougi)}</span><span>${optionalNumber(analysis.breakdown.echo)}</span><span>${optionalNumber(analysis.breakdown.supplemental)}</span><span>${formatPercent(analysis.criticalRate)}</span>
      </button>${selected ? `<div class="cockpit-inline-detail">${renderSelectedAnalysis(view, 'inline')}</div>` : ''}`;
    }).join('')}
  </section>`;
}

function renderSelectedAnalysis(view: CombatView, mode: 'wide' | 'deep' | 'inline'): string {
  const analysis = view.selected;
  if (!analysis) return '<section class="character-analysis"><p class="muted">Select a character after supported damage is observed.</p></section>';
  const actor = actorFor(view.context, analysis.actorId);
  const metadata = characterMetadata(view.metadata, analysis.actorId, analysis.actorName ?? actor?.name);
  return `<section class="character-analysis analysis-${mode}">
    <div class="analysis-character"><span class="analysis-portrait">${renderImage(metadata?.imageUrl, metadata?.name ?? analysis.actorName ?? analysis.actorId)}</span><div><p class="eyebrow">SELECTED CHARACTER</p><h3>${escapeHtml(metadata?.name ?? analysis.actorName ?? actor?.name ?? analysis.actorId)}</h3>${renderHp(actor)}<strong>${formatNumber(analysis.totalDamage)} total damage</strong></div></div>
    <div class="analysis-breakdown">
      ${analysisMetric('Normal', analysis.breakdown.normal)}${analysisMetric('Skill', analysis.breakdown.skill)}${analysisMetric('Ougi', analysis.breakdown.ougi)}${analysisMetric('Echo', analysis.breakdown.echo)}${analysisMetric('Supplemental', analysis.breakdown.supplemental)}
    </div>
    <div class="attack-mode-grid">
      ${attackMode('SA', analysis.single)}${attackMode('DA', analysis.double)}${attackMode('TA', analysis.triple)}
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
  return `<section class="summon-panel summon-panel-${mode}"><div class="section-title"><p class="eyebrow">SUMMONS</p><h3>Observed summons</h3></div>${renderSummonStrip(view)}</section>`;
}

function renderSummonStrip(view: CombatView): string {
  if (!view.summons.length) return '<p class="muted">No summon identity has been directly observed yet.</p>';
  return `<div class="summon-strip">${view.summons.map((summon) => `<article class="summon-card">${renderImage(summon.imageUrl, summon.name)}<strong>${escapeHtml(summon.name)}</strong><span>Observed</span></article>`).join('')}</div>`;
}

function renderParticipantsPanel(view: CombatView): string {
  return `<section class="combat-subpanel"><div class="section-title"><p class="eyebrow">PARTICIPANTS</p><h3>Raid participants</h3></div>${renderParticipantsTable(view)}</section>`;
}

function renderParticipantsTable(view: CombatView): string {
  if (!view.participantRows.length) {
    const count = view.raid.participants?.count;
    return `<p class="muted">${count === undefined ? 'No participant snapshot observed yet.' : `${formatNumber(count)} participants observed; detailed rows are not available in this session.`}</p>`;
  }
  return `<div class="participant-grid"><div class="participant-grid-row head"><span>#</span><span>Player</span><span>Rank</span><span>Honors</span><span>HP</span><span>Status</span></div>${view.participantRows.slice(0, 30).map((participant) => `<div class="participant-grid-row"><strong>${participant.placement === undefined ? '—' : `#${participant.placement}`}</strong><span>${escapeHtml(participant.name)}</span><span>${optionalNumber(participant.level)}</span><span>${optionalNumber(participant.honors)}</span><span>${participant.hpPercent === undefined ? '—' : `${participant.hpPercent.toFixed(1)}%`}</span><span>${escapeHtml(participantStatus(participant))}</span></div>`).join('')}</div>`;
}

function renderLogPanel(view: CombatView): string {
  return `<section class="combat-subpanel"><div class="section-title"><p class="eyebrow">LOG</p><h3>Combat log</h3></div>${renderLog(view)}</section>`;
}

function renderLog(view: CombatView): string {
  if (!view.raid.log.length) return '<p class="muted">No supported actions observed.</p>';
  return `<div class="combat-timeline">${view.raid.log.slice(-80).reverse().map((entry) => `<div class="combat-timeline-row"><span>${entry.turn === undefined ? 'T—' : `T${entry.turn}`}</span><strong>${escapeHtml(entry.actorName ?? entry.actorId ?? 'Unknown actor')}</strong><span>${escapeHtml(entry.actionName ?? entry.actionKind)}</span><span>${formatNumber(entry.damage)}</span></div>`).join('')}</div>`;
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

function attackMode(label: string, value: { count: number; damage: number } | undefined): string {
  return `<div class="analysis-stat"><span>${label}</span><strong>${value?.count ?? '—'}</strong><small>${value ? `${formatNumber(value.damage)} damage` : 'not source-proven'}</small></div>`;
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
