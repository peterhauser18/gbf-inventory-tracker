import './goals.css';
import { loadAccountDatabase } from '../account/storage.ts';
import { buildDashboardViewModel, type PlannerCard, type PlannerStep } from './model.ts';
import {
  GOAL_PINS_STORAGE_KEY,
  aggregatePinnedMaterialDeficits,
  isGoalPinned,
  parseGoalPins,
  resolvePinnedGoals,
  toggleGoalPin,
  type GoalMaterialDeficit,
  type GoalPin,
  type PinnedGoalSummary,
} from './goals.ts';

const app = document.querySelector<HTMLElement>('#dashboard-app');
let plannerCards: PlannerCard[] = [];
let storageAvailable = true;
let pins = readGoalPins();
let modelState: 'loading' | 'ready' | 'empty' | 'error' = 'loading';
let modelError = '';
let goalsSelected = false;
let syncQueued = false;

if (app) {
  app.addEventListener('click', handleClick, true);
  const observer = new MutationObserver(scheduleSync);
  observer.observe(app, { childList: true, subtree: true });
  scheduleSync();
  void loadPlannerCards();
}

async function loadPlannerCards(): Promise<void> {
  try {
    const account = await loadAccountDatabase();
    if (!account) {
      plannerCards = [];
      modelState = 'empty';
    } else {
      const view = buildDashboardViewModel(account.snapshot);
      plannerCards = [...view.eternals, ...view.evokers];
      modelState = 'ready';
    }
  } catch (error) {
    plannerCards = [];
    modelState = 'error';
    modelError = error instanceof Error ? error.message : String(error);
  }
  scheduleSync();
}

function handleClick(event: MouseEvent): void {
  if (!app) return;
  const target = event.target as Element | null;
  const goalNav = target?.closest<HTMLButtonElement>('.nav-item[data-section="goals"], [data-open-goals]');
  if (goalNav) {
    event.preventDefault();
    event.stopImmediatePropagation();
    goalsSelected = true;
    renderGoalsView();
    return;
  }

  const otherNav = target?.closest<HTMLButtonElement>('.nav-item[data-section]:not([data-section="goals"])');
  if (otherNav) goalsSelected = false;

  const pinButton = target?.closest<HTMLButtonElement>('[data-goal-pin]');
  if (pinButton) {
    event.preventDefault();
    event.stopPropagation();
    const plannerKey = pinButton.dataset.plannerKey;
    const goalId = pinButton.dataset.goalId;
    if (!plannerKey || !goalId) return;
    pins = toggleGoalPin(pins, plannerKey, goalId, Date.now());
    persistGoalPins();
    if (goalsSelected) renderGoalsView();
    else scheduleSync();
    return;
  }

  const openButton = target?.closest<HTMLButtonElement>('[data-goal-open]');
  if (openButton) {
    event.preventDefault();
    event.stopPropagation();
    const plannerKey = openButton.dataset.goalOpen;
    if (plannerKey) openPlanner(plannerKey);
  }
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
  if (goalsSelected) {
    if (!app.querySelector('[data-goals-view]')) renderGoalsView();
    return;
  }
  syncPlannerPinButtons();
  syncOverviewGoals();
}

function syncPlannerPinButtons(): void {
  if (!app || plannerCards.length === 0) return;
  const stepLookup = new Map<string, { card: PlannerCard; step: PlannerStep }>();
  for (const card of plannerCards) {
    for (const step of card.steps) stepLookup.set(`${card.key}:${step.goalId}`, { card, step });
  }

  app.querySelectorAll<HTMLButtonElement>('.planner-step-toggle[data-planner-step]').forEach((toggle) => {
    const lookup = stepLookup.get(toggle.dataset.plannerStep ?? '');
    if (!lookup) return;
    const plannerStep = toggle.closest<HTMLElement>('.planner-step');
    if (!plannerStep) return;
    let button = plannerStep.querySelector<HTMLButtonElement>('[data-goal-pin]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'goal-pin-inline';
      button.dataset.goalPin = 'true';
      button.dataset.plannerKey = lookup.card.key;
      button.dataset.goalId = lookup.step.goalId;
      toggle.insertAdjacentElement('afterend', button);
    }
    const active = isGoalPinned(pins, lookup.card.key, lookup.step.goalId);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    const label = active ? '★ Pinned target' : '☆ Pin target';
    if (button.textContent !== label) button.textContent = label;
  });
}

function syncOverviewGoals(): void {
  if (!app) return;
  const overview = app.querySelector('.nav-item.active[data-section="overview"]');
  const existing = app.querySelector('[data-goal-overview]');
  if (!overview) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const header = app.querySelector<HTMLElement>('.content .content-header');
  if (!header) return;
  header.insertAdjacentHTML('afterend', renderOverviewGoals());
}

function renderOverviewGoals(): string {
  if (modelState === 'loading') return shellMessage('Loading goals', 'Reading the existing local planner snapshot…', 'goal-overview-grid', 'data-goal-overview');
  if (modelState === 'error') return shellMessage('Goals unavailable', modelError || 'The local planner could not be loaded.', 'goal-overview-grid', 'data-goal-overview');

  const { goals, stalePins } = resolvePinnedGoals(plannerCards, pins);
  const active = goals.filter((goal) => goal.targetReached !== true);
  const deficits = deficitRows(aggregatePinnedMaterialDeficits(active));
  const quality = goalSummaryQuality(active);
  return `
    <section class="goal-overview-grid" data-goal-overview>
      <article class="goal-panel goal-next-panel">
        <div class="goal-panel-head">
          <div><p class="eyebrow">NEXT ACTIONS</p><h3>What should I work on?</h3></div>
          <button class="goal-link-button" type="button" data-open-goals>All goals</button>
        </div>
        ${renderNextActions(goals)}
        ${stalePins.length ? `<p class="goal-warning">${stalePins.length} saved goal reference${stalePins.length === 1 ? ' is' : 's are'} no longer modeled and is excluded.</p>` : ''}
      </article>
      <article class="goal-panel">
        <div class="goal-panel-head">
          <div><p class="eyebrow">MATERIAL DEFICITS</p><h3>Pinned targets</h3></div>
          ${qualityChip(quality)}
        </div>
        ${renderDeficits(deficits, 6)}
      </article>
    </section>
  `;
}

function renderGoalsView(): void {
  if (!app) return;
  app.querySelectorAll<HTMLElement>('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.section === 'goals'));
  app.querySelectorAll('.detail-backdrop, .detail-panel').forEach((element) => element.remove());
  const content = app.querySelector<HTMLElement>('.content');
  if (!content) return;

  const modelMessage = modelState === 'loading'
    ? '<div class="goal-empty"><strong>Loading local planner…</strong><span>No network request is needed.</span></div>'
    : modelState === 'error'
      ? `<div class="goal-empty"><strong>Goals unavailable</strong><span>${escapeHtml(modelError || 'The local planner could not be loaded.')}</span></div>`
      : '';
  const { goals, stalePins } = resolvePinnedGoals(plannerCards, pins);

  content.innerHTML = `
    <div class="command-bar">
      <button class="command-trigger" type="button" data-command-trigger aria-haspopup="dialog">
        <span class="command-icon" aria-hidden="true">⌕</span>
        <span>Search or jump to a dashboard area…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span class="read-only-pill">Read-only</span>
    </div>
    <header class="content-header" data-goals-view>
      <div>
        <p class="eyebrow">GOALS</p>
        <h2>Pinned progress targets</h2>
        <p class="muted">Pins are local dashboard preferences. Expand a target to inspect requirements and Wiki-backed farming sources for proven shortfalls.</p>
      </div>
      <div class="goal-storage-status">${storageAvailable ? 'Local persistence' : 'Session only · storage unavailable'}</div>
    </header>
    ${modelMessage || renderGoalsBody(goals, stalePins)}
  `;
}

function renderGoalsBody(goals: readonly PinnedGoalSummary[], stalePins: readonly GoalPin[]): string {
  if (goals.length === 0) {
    const hint = modelState === 'empty'
      ? 'No local account snapshot is available yet.'
      : 'Open an Eternal or Evoker, expand a modeled stage, and pin the target you want to work toward.';
    return `
      <section class="goal-empty goal-empty-large">
        <strong>No pinned goals</strong>
        <span>${escapeHtml(hint)}</span>
        ${stalePins.length ? `<span>${stalePins.length} saved reference${stalePins.length === 1 ? ' is' : 's are'} stale and intentionally ignored.</span>` : ''}
      </section>
    `;
  }
  return `
    <section class="goal-page-grid">
      <div class="goal-stack">
        <div class="goal-section-head"><div><p class="eyebrow">PINNED GOALS</p><h3>${goals.length} target${goals.length === 1 ? '' : 's'}</h3></div></div>
        ${goals.map(renderGoalCard).join('')}
        ${stalePins.length ? `<p class="goal-warning">${stalePins.length} saved goal reference${stalePins.length === 1 ? ' is' : 's are'} unavailable in the current modeled planner and is not included in totals.</p>` : ''}
      </div>
    </section>
  `;
}

function renderGoalCard(goal: PinnedGoalSummary): string {
  const knownMissing = goal.materials.filter((material) => material.state === 'known' && (material.missing ?? 0) > 0).length;
  const unknown = goal.materials.filter((material) => material.state === 'unknown').length;
  const stage = goal.currentStep?.targetDisplay ?? goal.targetDisplay;
  return `
    <article class="goal-card ${goal.targetReached === true ? 'reached' : ''}" data-goal-key="${escapeAttribute(goal.key)}">
      <div class="goal-card-main">
        <div class="goal-title-row">
          <div><strong>${escapeHtml(goal.title)}</strong><span>Target ${escapeHtml(goal.targetDisplay)}</span></div>
          ${qualityChip(goal.quality)}
        </div>
        <div class="goal-action-kind ${goal.nextAction.kind}">${escapeHtml(goal.nextAction.title)}</div>
        <p>${escapeHtml(goal.nextAction.detail)}</p>
        <div class="goal-meta-row">
          <span>Current stage <strong>${escapeHtml(stage)}</strong></span>
          <span>Known deficits <strong>${knownMissing}</strong></span>
          <span>Unknown materials <strong>${unknown}</strong></span>
        </div>
        ${renderGoalRequirements(goal.materials)}
      </div>
      <div class="goal-card-actions">
        <button type="button" class="goal-open-button" data-goal-open="${escapeAttribute(goal.plannerKey)}">Open planner</button>
        <button type="button" class="goal-unpin-button" data-goal-pin data-planner-key="${escapeAttribute(goal.plannerKey)}" data-goal-id="${escapeAttribute(goal.goalId)}">Unpin</button>
      </div>
    </article>
  `;
}

function renderGoalRequirements(materials: readonly GoalMaterialDeficit[]): string {
  if (materials.length === 0) return '<div class="goal-requirement-ready">No remaining modeled material requirement for this target.</div>';
  const knownMissing = materials.filter((material) => material.state === 'known' && (material.missing ?? 0) > 0).length;
  const unknown = materials.filter((material) => material.state === 'unknown').length;
  return `
    <details class="goal-requirements" data-goal-requirements>
      <summary class="goal-requirements-summary">
        <span>Requirements</span>
        <small>${knownMissing} missing · ${unknown} unknown · ${materials.length} modeled</small>
      </summary>
      <div class="goal-requirement-list">
        ${materials.map(renderGoalRequirement).join('')}
      </div>
    </details>
  `;
}

function renderGoalRequirement(material: GoalMaterialDeficit): string {
  const missing = material.state === 'known' ? material.missing ?? 0 : undefined;
  const statusClass = material.state === 'unknown' ? 'unknown' : missing === 0 ? 'enough' : 'missing';
  const wikiTitle = material.wikiTitle?.trim();
  const icon = wikiTitle
    ? `<span class="goal-material-icon"><img data-goal-material-icon data-wiki-title="${escapeAttribute(wikiTitle)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span>`
    : '<span class="goal-material-icon empty" aria-hidden="true"></span>';
  return `
    <div class="goal-requirement-row ${statusClass}" data-goal-material-key="${escapeAttribute(material.key)}">
      ${icon}
      <span class="goal-requirement-name">${escapeHtml(material.name)}</span>
      <small>${material.state === 'known'
        ? `Have ${formatNumber(material.owned ?? 0)} · Required ${formatNumber(material.required)} · Missing ${formatNumber(missing ?? 0)}`
        : `Have ? · Required ${formatNumber(material.required)} · Missing ?`}</small>
      ${material.state === 'known' && (missing ?? 0) > 0 ? '<div class="goal-material-farming" data-goal-material-farming></div>' : ''}
    </div>
  `;
}

function renderNextActions(goals: readonly PinnedGoalSummary[]): string {
  if (goals.length === 0) return '<div class="goal-empty"><strong>No pinned goals</strong><span>Pin an Eternal or Evoker target to get deterministic next actions.</span></div>';
  const sorted = [...goals].sort((left, right) => actionRank(left.nextAction.kind) - actionRank(right.nextAction.kind) || left.pin.pinnedAt - right.pin.pinnedAt);
  return `<div class="goal-action-list">${sorted.slice(0, 5).map((goal) => `
    <button class="goal-action-row" type="button" data-goal-open="${escapeAttribute(goal.plannerKey)}">
      <span class="goal-action-dot ${goal.nextAction.kind}" aria-hidden="true"></span>
      <span><strong>${escapeHtml(goal.nextAction.title)}</strong><small>${escapeHtml(goal.title)} · ${escapeHtml(goal.nextAction.detail)}</small></span>
      ${qualityChip(goal.nextAction.quality)}
    </button>
  `).join('')}</div>`;
}

function renderDeficits(deficits: readonly GoalMaterialDeficit[], limit: number): string {
  if (deficits.length === 0) return '<div class="goal-empty"><strong>No material deficit to show</strong><span>Pin an active target, or all modeled requirements may already be proven sufficient.</span></div>';
  return `
    <div class="goal-deficit-table" role="table" aria-label="Pinned goal material deficits">
      <div class="goal-deficit-row header" role="row"><span>Material</span><span>Owned</span><span>Required</span><span>Missing</span></div>
      ${deficits.slice(0, limit).map((material) => `
        <div class="goal-deficit-row" role="row">
          <span>${escapeHtml(material.name)} ${material.state === 'unknown' ? qualityChip('unknown') : ''}</span>
          <span>${material.state === 'known' ? formatNumber(material.owned ?? 0) : '?'}</span>
          <span>${formatNumber(material.required)}</span>
          <strong class="${material.state === 'known' && (material.missing ?? 0) === 0 ? 'enough' : ''}">${material.state === 'known' ? formatNumber(material.missing ?? 0) : '?'}</strong>
        </div>
      `).join('')}
    </div>
    ${deficits.length > limit ? `<p class="goal-table-note">${deficits.length - limit} more deficit row${deficits.length - limit === 1 ? '' : 's'} in Goals.</p>` : ''}
  `;
}

function deficitRows(deficits: readonly GoalMaterialDeficit[]): GoalMaterialDeficit[] {
  return deficits.filter((material) => material.state === 'unknown' || (material.missing ?? 0) > 0);
}

function openPlanner(plannerKey: string): void {
  if (!app) return;
  goalsSelected = false;
  const section = plannerKey.startsWith('evoker:') ? 'evokers' : 'eternals';
  const nav = app.querySelector<HTMLButtonElement>(`.nav-item[data-section="${section}"]`);
  nav?.click();
  queueMicrotask(() => {
    const detail = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-detail]')).find((button) => button.dataset.detail === plannerKey);
    detail?.click();
  });
}

function readGoalPins(): GoalPin[] {
  try {
    return parseGoalPins(localStorage.getItem(GOAL_PINS_STORAGE_KEY));
  } catch {
    storageAvailable = false;
    return [];
  }
}

function persistGoalPins(): void {
  try {
    localStorage.setItem(GOAL_PINS_STORAGE_KEY, JSON.stringify(pins));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
}

function goalSummaryQuality(goals: readonly PinnedGoalSummary[]): 'known' | 'partial' | 'unknown' {
  if (goals.length === 0) return 'known';
  if (goals.every((goal) => goal.quality === 'known')) return 'known';
  if (goals.every((goal) => goal.quality === 'unknown')) return 'unknown';
  return 'partial';
}

function qualityChip(quality: 'known' | 'partial' | 'unknown'): string {
  return `<span class="quality ${quality}">${quality}</span>`;
}

function actionRank(kind: PinnedGoalSummary['nextAction']['kind']): number {
  switch (kind) {
    case 'ready': return 0;
    case 'farm': return 1;
    case 'prerequisite': return 2;
    case 'verify': return 3;
    case 'reached': return 4;
  }
}

function shellMessage(title: string, detail: string, className: string, dataAttribute: string): string {
  return `<section class="${className}" ${dataAttribute}><div class="goal-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div></section>`;
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
