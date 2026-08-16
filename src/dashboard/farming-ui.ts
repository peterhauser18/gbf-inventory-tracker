import './farming.css';
import { loadAccountDatabase } from '../account/storage.ts';
import { getAllDropPreferences, getRaidHistory, saveDropPreferences } from '../combat/storage.ts';
import type { RaidDropPreferences, RaidHistoryRecord } from '../combat/types.ts';
import { buildDashboardViewModel, type PlannerCard } from './model.ts';
import {
  GOAL_PINS_STORAGE_KEY,
  aggregatePinnedMaterialDeficits,
  parseGoalPins,
  resolvePinnedGoals,
  type GoalMaterialDeficit,
  type PinnedGoalSummary,
} from './goals.ts';
import {
  buildFarmingFocus,
  ensureRaidDropTracked,
  normalizeWikiTitle,
  type FarmingFocusEntry,
  type WikiMaterialRaidSources,
} from './farming.ts';
import { loadWikiMaterialThumbnails } from './wiki-assets.ts';
import { loadWikiMaterialRaidSources } from './wiki-sources.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
const wikiSources = new Map<string, WikiMaterialRaidSources>();
const wikiQueued = new Set<string>();
const wikiQueue: string[] = [];
const hydratedGoalRequirements = new WeakSet<HTMLDetailsElement>();
const MAX_WIKI_CONCURRENCY = 4;
let wikiActive = 0;
let plannerCards: PlannerCard[] = [];
let raids: RaidHistoryRecord[] = [];
let preferences: RaidDropPreferences[] = [];
let localState: 'loading' | 'ready' | 'error' = 'loading';
let syncQueued = false;
let refreshQueued = false;

if (app) {
  document.addEventListener('click', handleClick, true);
  void refreshLocalData();
}

async function refreshLocalData(): Promise<void> {
  if (refreshQueued) return;
  refreshQueued = true;
  localState = 'loading';
  scheduleSync();
  try {
    const pins = readPins();
    if (pins.length === 0) {
      plannerCards = [];
      raids = [];
      preferences = [];
      localState = 'ready';
      return;
    }

    const account = await loadAccountDatabase();
    if (!account) {
      plannerCards = [];
      raids = [];
      preferences = [];
      localState = 'ready';
      return;
    }

    const view = buildDashboardViewModel(account.snapshot);
    plannerCards = [...view.eternals, ...view.evokers];
    const activeGoals = resolvePinnedGoals(plannerCards, pins).goals.filter((goal) => goal.targetReached !== true);
    const deficits = aggregatePinnedMaterialDeficits(activeGoals)
      .filter((material) => material.state === 'known' && (material.missing ?? 0) > 0);

    if (deficits.length === 0) {
      raids = [];
      preferences = [];
      localState = 'ready';
      return;
    }

    raids = await getRaidHistory();
    preferences = await getAllDropPreferences();
    localState = 'ready';
  } catch {
    plannerCards = [];
    raids = [];
    preferences = [];
    localState = 'error';
  } finally {
    refreshQueued = false;
    scheduleSync();
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  const track = target?.closest<HTMLButtonElement>('[data-farming-track]');
  if (track) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const raidTechnicalId = track.dataset.raidId;
    const itemId = track.dataset.itemId;
    if (raidTechnicalId && itemId) void trackInRaids(raidTechnicalId, itemId);
    return;
  }

  const openRaids = target?.closest<HTMLButtonElement>('[data-farming-open-raids]');
  if (openRaids) {
    event.preventDefault();
    event.stopImmediatePropagation();
    app?.querySelector<HTMLButtonElement>('.nav-item[data-section="raids"]')?.click();
    return;
  }

  if (target?.closest<HTMLButtonElement>('[data-goal-pin]')) {
    queueMicrotask(() => void refreshLocalData());
    return;
  }

  const requirementSummary = target?.closest<HTMLElement>('.goal-requirements-summary');
  if (requirementSummary) {
    const details = requirementSummary.closest<HTMLDetailsElement>('[data-goal-requirements]');
    if (details) queueMicrotask(() => void hydrateGoalRequirements(details));
    return;
  }

  const nav = target?.closest<HTMLButtonElement>('.nav-item[data-section="overview"], .nav-item[data-section="goals"]');
  if (nav) queueMicrotask(() => void refreshLocalData());
}

async function hydrateGoalRequirements(details: HTMLDetailsElement): Promise<void> {
  if (!details.isConnected || !details.open || hydratedGoalRequirements.has(details)) return;
  const goal = goalForDetails(details);
  if (!goal) return;
  hydratedGoalRequirements.add(details);

  const titles = goal.materials
    .map((material) => material.wikiTitle?.trim())
    .filter((title): title is string => Boolean(title));
  if (titles.length) {
    const thumbnails = await loadWikiMaterialThumbnails(titles);
    if (details.isConnected) {
      details.querySelectorAll<HTMLImageElement>('[data-goal-material-icon]').forEach((image) => {
        const title = image.dataset.wikiTitle?.trim();
        if (!title || image.getAttribute('src')) return;
        const url = thumbnails.get(normalizeWikiTitle(title));
        if (url) image.src = url;
      });
    }
  }

  const missing = goal.materials.filter((material) => material.state === 'known' && (material.missing ?? 0) > 0);
  queueMissingWikiSources(missing);
  scheduleSync();
}

function goalForDetails(details: HTMLDetailsElement): PinnedGoalSummary | undefined {
  const card = details.closest<HTMLElement>('[data-goal-key]');
  const goalKey = card?.dataset.goalKey;
  if (!goalKey) return undefined;
  const active = resolvePinnedGoals(plannerCards, readPins()).goals.filter((goal) => goal.targetReached !== true);
  return active.find((goal) => goal.key === goalKey);
}

async function trackInRaids(raidTechnicalId: string, itemId: string): Promise<void> {
  const current = preferences.find((entry) => entry.raidTechnicalId === raidTechnicalId);
  const next = ensureRaidDropTracked(current, raidTechnicalId, itemId, Date.now());
  await saveDropPreferences(next);
  preferences = [
    ...preferences.filter((entry) => entry.raidTechnicalId !== raidTechnicalId),
    next,
  ];
  scheduleSync();
}

function scheduleSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncUi();
  });
}

function syncUi(): void {
  if (!app) return;
  const goalsView = app.querySelector<HTMLElement>('[data-goals-view]');
  const overviewActive = Boolean(app.querySelector('.nav-item.active[data-section="overview"]'));

  if (goalsView) {
    app.querySelectorAll('[data-farming-focus]').forEach((node) => node.remove());
    if (localState !== 'ready') return;
    const activeGoals = resolvePinnedGoals(plannerCards, readPins()).goals.filter((goal) => goal.targetReached !== true);
    app.querySelectorAll<HTMLDetailsElement>('[data-goal-requirements][open]').forEach((details) => {
      void hydrateGoalRequirements(details);
    });
    syncGoalInlineFarming(activeGoals);
    return;
  }

  if (!overviewActive) {
    app.querySelectorAll('[data-farming-focus]').forEach((node) => node.remove());
    return;
  }

  if (localState === 'loading') {
    renderFocusSurface('<div class="farming-empty"><strong>Loading farming focus</strong><span>Reading local goals and raid history…</span></div>');
    return;
  }
  if (localState === 'error') {
    renderFocusSurface('<div class="farming-empty"><strong>Farming focus unavailable</strong><span>Local planner or raid history could not be read.</span></div>');
    return;
  }

  const pins = readPins();
  const activeGoals = resolvePinnedGoals(plannerCards, pins).goals.filter((goal) => goal.targetReached !== true);
  const deficits = aggregatePinnedMaterialDeficits(activeGoals)
    .filter((material) => material.state === 'known' && (material.missing ?? 0) > 0);
  queueMissingWikiSources(deficits);
  const focus = buildFarmingFocus(deficits, wikiSources, raids, preferences);
  renderFocusSurface(renderFarmingFocus(focus, 5));
}

function syncGoalInlineFarming(goals: readonly PinnedGoalSummary[]): void {
  if (!app) return;
  for (const goal of goals) {
    const card = Array.from(app.querySelectorAll<HTMLElement>('[data-goal-key]'))
      .find((candidate) => candidate.dataset.goalKey === goal.key);
    if (!card) continue;
    for (const material of goal.materials) {
      if (material.state !== 'known' || (material.missing ?? 0) <= 0) continue;
      const row = Array.from(card.querySelectorAll<HTMLElement>('[data-goal-material-key]'))
        .find((candidate) => candidate.dataset.goalMaterialKey === material.key);
      const target = row?.querySelector<HTMLElement>('[data-goal-material-farming]');
      if (!target) continue;
      const entry = buildFarmingFocus([material], wikiSources, raids, preferences)[0];
      const body = entry ? renderGoalMaterialFarming(entry) : '';
      if (target.innerHTML !== body) target.innerHTML = body;
    }
  }
}

function renderGoalMaterialFarming(entry: FarmingFocusEntry): string {
  const title = entry.material.wikiTitle?.trim();
  if (!title) {
    return '<div class="goal-farming-state">No modeled Wiki title is available for this material.</div>';
  }
  const wiki = entry.wiki;
  if (!wiki) {
    return '<div class="goal-farming-state">Loading Wiki farming sources…</div>';
  }
  if (wiki.state === 'unavailable') {
    return `<div class="goal-farming-state"><strong>Wiki farming source unavailable</strong><span>${escapeHtml(wiki.limitation ?? 'No safe raid source conclusion can be made.')}</span><a href="${escapeAttribute(wiki.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Material page ↗</a></div>`;
  }
  return `<div class="goal-inline-farming">
    <div class="goal-inline-farming-head"><strong>Wiki farming sources</strong><a href="${escapeAttribute(wiki.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Material page ↗</a></div>
    <div class="farming-source-list">${entry.sources.map((source) => renderFarmingSource(source, entry.material)).join('')}</div>
  </div>`;
}

function readPins() {
  try {
    return parseGoalPins(localStorage.getItem(GOAL_PINS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function queueMissingWikiSources(materials: readonly GoalMaterialDeficit[]): void {
  for (const material of materials) {
    const title = material.wikiTitle?.trim();
    if (!title) continue;
    const key = normalizeWikiTitle(title);
    if (wikiSources.has(key) || wikiQueued.has(key)) continue;
    wikiQueued.add(key);
    wikiQueue.push(title);
  }
  pumpWikiQueue();
}

function pumpWikiQueue(): void {
  while (wikiActive < MAX_WIKI_CONCURRENCY && wikiQueue.length > 0) {
    const title = wikiQueue.shift();
    if (!title) continue;
    const key = normalizeWikiTitle(title);
    wikiActive += 1;
    void loadWikiMaterialRaidSources(title)
      .then((result) => wikiSources.set(key, result))
      .finally(() => {
        wikiActive -= 1;
        scheduleSync();
        pumpWikiQueue();
      });
  }
}

function renderFocusSurface(body: string): void {
  if (!app) return;
  let container = app.querySelector<HTMLElement>('[data-farming-focus="overview"]');
  if (!container) {
    container = document.createElement('section');
    container.dataset.farmingFocus = 'overview';
    container.className = 'farming-focus farming-focus-overview';
    const goalsOverview = app.querySelector<HTMLElement>('[data-goal-overview]');
    const header = app.querySelector<HTMLElement>('.content .content-header');
    if (goalsOverview) goalsOverview.insertAdjacentElement('afterend', container);
    else if (header) header.insertAdjacentElement('afterend', container);
    else return;
  }
  app.querySelectorAll<HTMLElement>('[data-farming-focus]').forEach((node) => {
    if (node !== container) node.remove();
  });
  if (container.innerHTML !== body) container.innerHTML = body;
}

function renderFarmingFocus(entries: readonly FarmingFocusEntry[], limit: number): string {
  if (!entries.length) {
    return `<div class="farming-panel"><div class="farming-head"><div><p class="eyebrow">FARMING FOCUS</p><h3>Wiki-backed raid sources</h3></div></div><div class="farming-empty"><strong>No proven material shortfall to farm</strong><span>Unknown inventory stays out of farming recommendations until ownership is known.</span></div></div>`;
  }
  const visible = entries.slice(0, limit);
  return `<div class="farming-panel">
    <div class="farming-head">
      <div><p class="eyebrow">FARMING FOCUS</p><h3>Wiki-backed raid sources</h3><p>GBF Wiki determines possible sources. Personal history is used only for your observed rate and estimate.</p></div>
      <button type="button" class="farming-open-raids" data-farming-open-raids>Open Raids</button>
    </div>
    <div class="farming-material-list">${visible.map(renderFarmingMaterial).join('')}</div>
    ${entries.length > limit ? `<p class="farming-note">${entries.length - limit} more known material deficit${entries.length - limit === 1 ? '' : 's'} in Goals.</p>` : ''}
  </div>`;
}

function renderFarmingMaterial(entry: FarmingFocusEntry): string {
  const missing = entry.material.missing ?? 0;
  const wiki = entry.wiki;
  let sources = entry.material.wikiTitle?.trim()
    ? '<div class="farming-source-state">Loading GBF Wiki sources…</div>'
    : '<div class="farming-source-state"><strong>Wiki source unknown</strong><span>No modeled Wiki title exists for this material, so GBF Tool does not guess a source page.</span></div>';
  if (wiki?.state === 'unavailable') {
    sources = `<div class="farming-source-state"><strong>Wiki source unavailable</strong><span>${escapeHtml(wiki.limitation ?? 'No safe source conclusion can be made.')}</span><a href="${escapeAttribute(wiki.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Material page ↗</a></div>`;
  } else if (wiki?.state === 'known') {
    sources = `<div class="farming-source-list">${entry.sources.map((source) => renderFarmingSource(source, entry.material)).join('')}</div>`;
  }
  const wikiMeta = wiki
    ? `<small>GBF Wiki${wiki.freshness ? ` ${escapeHtml(wiki.freshness)}` : ''} · <a class="farming-material-source" href="${escapeAttribute(wiki.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">material source ↗</a></small>`
    : '<small>GBF Wiki lookup</small>';
  return `<article class="farming-material">
    <div class="farming-material-head"><div><strong>${escapeHtml(entry.material.name)}</strong><span>Missing ${formatNumber(missing)}</span></div>${wikiMeta}</div>
    ${sources}
  </article>`;
}

function renderFarmingSource(source: FarmingFocusEntry['sources'][number], material: FarmingFocusEntry['material']): string {
  const personal = source.personal;
  let evidence = '<span>No matching local raid history yet. Wiki source is still valid.</span>';
  let actions = '<button type="button" data-farming-open-raids>Open Raids</button>';
  if (personal) {
    if (personal.itemId) {
      const rate = personal.appearanceRate === undefined ? '—' : `${(personal.appearanceRate * 100).toFixed(1)}%`;
      const quantityRate = personal.quantityPerEligibleRun === undefined ? '—' : personal.quantityPerEligibleRun.toFixed(2);
      evidence = `<span>Personal: ${formatNumber(personal.observedDropRuns ?? 0)}/${formatNumber(personal.eligibleRuns)} eligible runs · ${rate} appearance · ${formatNumber(personal.quantityReceived ?? 0)} qty · ${quantityRate}/run</span>`;
      if (personal.estimatedRunsRemaining !== undefined) {
        evidence += `<strong>≈ ${formatNumber(personal.estimatedRunsRemaining)} runs at your observed average <em>(${formatNumber(personal.eligibleRuns)} eligible runs; empirical, not official)</em></strong>`;
      }
      actions = `${personal.tracked
        ? '<button type="button" disabled>✓ Tracked in Raids</button>'
        : `<button type="button" data-farming-track data-raid-id="${escapeAttribute(personal.raidTechnicalId)}" data-item-id="${escapeAttribute(personal.itemId)}">Track in Raids</button>`}<button type="button" data-farming-open-raids>Open Raids</button>`;
    } else {
      evidence = `<span>Matched ${escapeHtml(personal.raidName ?? personal.raidTechnicalId)} locally (${formatNumber(personal.eligibleRuns)} eligible runs), but this material's technical item ID is not proven yet. Tracking/rate stays unavailable.</span>`;
    }
  }
  return `<div class="farming-source">
    <div class="farming-source-main"><div><strong>${escapeHtml(source.wiki.name)}</strong><a href="${escapeAttribute(source.wiki.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Raid page ↗</a></div><div class="farming-evidence">${evidence}</div></div>
    <div class="farming-source-actions">${actions}</div>
  </div>`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
