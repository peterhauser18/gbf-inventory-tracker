import './cockpit-attack-modes.css';
import { buildCharacterAnalyses, type CharacterCombatAnalysis, type AttackModeSummary } from './analytics.ts';
import { getActiveCombatRaids, getRaidHistory } from './storage.ts';
import type { NormalizedRaidParse } from './types.ts';

let latestDecorationRun = 0;

export async function decorateCockpitAttackModes(root: HTMLElement): Promise<void> {
  root.querySelectorAll<HTMLElement>('.cockpit-selected-analysis').forEach((analysis) => analysis.remove());

  const run = ++latestDecorationRun;
  const activeCards = [...root.querySelectorAll<HTMLElement>('[data-active-combat-key]')];
  const historyCards = [...root.querySelectorAll<HTMLElement>('.raid-card')];
  const [active, history] = await Promise.all([
    activeCards.length ? getActiveCombatRaids() : Promise.resolve([]),
    historyCards.length ? getRaidHistory() : Promise.resolve([]),
  ]);
  if (run !== latestDecorationRun || !root.isConnected) return;

  const activeByKey = new Map(active.map((entry) => [entry.key, entry.parse]));
  const historyById = new Map(history.map((entry) => [entry.localId, entry]));

  for (const card of activeCards) {
    if (!card.isConnected) continue;
    const key = card.dataset.activeCombatKey;
    const raid = key ? activeByKey.get(key) : undefined;
    if (raid) decorateTable(card, raid);
  }

  for (const card of historyCards) {
    if (!card.isConnected) continue;
    const localId = card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport;
    const raid = localId ? historyById.get(localId) : undefined;
    if (raid) decorateTable(card, raid);
  }
}

function decorateTable(scope: HTMLElement, raid: NormalizedRaidParse): void {
  const table = scope.querySelector<HTMLElement>('.cockpit-table');
  const head = table?.querySelector<HTMLElement>('.cockpit-head');
  if (!table || !head) return;

  normalizeHeader(head);
  const analyses = new Map(buildCharacterAnalyses(raid).map((entry) => [entry.actorId, entry]));
  for (const row of table.querySelectorAll<HTMLElement>('button.cockpit-row[data-character-select]')) {
    normalizeRow(row, analyses.get(row.dataset.characterSelect ?? ''));
  }
}

function normalizeHeader(head: HTMLElement): void {
  for (const cell of [...head.children] as HTMLElement[]) {
    if (cell.textContent?.trim() === 'Echo' || cell.textContent?.trim() === 'Supp.') cell.remove();
  }
  if (head.querySelector('.cockpit-attack-mode-head')) return;

  const crit = [...head.children].find((cell) => cell.textContent?.trim() === 'Crit') ?? null;
  for (const label of ['SA', 'DA', 'TA']) {
    const cell = document.createElement('span');
    cell.className = 'cockpit-attack-mode-head';
    cell.textContent = label;
    head.insertBefore(cell, crit);
  }
}

function normalizeRow(row: HTMLElement, analysis: CharacterCombatAnalysis | undefined): void {
  if (!row.dataset.attackModesNormalized) {
    const cells = [...row.children] as HTMLElement[];
    if (cells.length >= 8) {
      cells[6]?.remove();
      cells[5]?.remove();
    }
    row.dataset.attackModesNormalized = 'true';
  }

  row.querySelectorAll('.cockpit-attack-mode').forEach((cell) => cell.remove());
  const crit = row.lastElementChild;
  const total = (analysis?.single?.count ?? 0) + (analysis?.double?.count ?? 0) + (analysis?.triple?.count ?? 0);
  for (const mode of [analysis?.single, analysis?.double, analysis?.triple]) {
    const cell = document.createElement('span');
    cell.className = 'cockpit-attack-mode';
    cell.title = 'Share of normal attacks whose SA/DA/TA mode was observed';
    cell.textContent = attackModeLabel(mode, total);
    row.insertBefore(cell, crit);
  }
}

function attackModeLabel(mode: AttackModeSummary | undefined, total: number): string {
  if (total <= 0) return '—';
  const count = mode?.count ?? 0;
  const percent = count / total * 100;
  return `${count} (${formatPercent(percent)}%)`;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
