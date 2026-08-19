export function applySharedCombatPresentationFixes(root: HTMLElement): void {
  compactSelectedAnalysis(root);
  moveCockpitSelectedAnalysisInline(root);
  labelCockpitSummons(root);

  const selectors = [
    '.analysis-character h3',
    '.party-card-copy strong',
    '.cockpit-character strong',
    '.combat-timeline-row strong',
  ];
  root.querySelectorAll<HTMLElement>(selectors.join(',')).forEach((label) => {
    if (!isTechnicalMainCharacterLabel(label.textContent)) return;
    label.textContent = 'Main Character';
    const owner = label.closest<HTMLElement>('.analysis-character, .party-card, .cockpit-character, .combat-timeline-row');
    const initials = owner?.querySelector<HTMLElement>('.combat-image > span');
    if (initials) initials.textContent = 'MC';
  });

  alignHistoricalLoadouts(root);
}

export function isTechnicalMainCharacterLabel(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return /(?:^|_)sp(?:_|$)/i.test(text) && /\d/.test(text);
}

function compactSelectedAnalysis(root: HTMLElement): void {
  for (const analysis of root.querySelectorAll<HTMLElement>('.character-analysis')) {
    const grid = analysis.querySelector<HTMLElement>('.attack-mode-grid');
    if (!grid) continue;

    const stats = [...grid.querySelectorAll<HTMLElement>(':scope > .analysis-stat')];
    const byLabel = new Map(stats.flatMap((card) => {
      const label = card.querySelector<HTMLElement>(':scope > span')?.textContent?.trim();
      return label ? [[label, card] as const] : [];
    }));

    const ougiCard = byLabel.get('Ougi') ?? byLabel.get('Ougi uses');
    const ougiCount = ougiCard?.querySelector<HTMLElement>(':scope > strong')?.textContent?.trim();
    const ougiMetric = [...analysis.querySelectorAll<HTMLElement>('.analysis-breakdown > div')]
      .find((metric) => metric.querySelector<HTMLElement>(':scope > span')?.textContent?.trim() === 'Ougi');
    const ougiLabel = ougiMetric?.querySelector<HTMLElement>(':scope > span');
    if (ougiLabel && ougiCount) ougiLabel.textContent = `Ougi / ${ougiCount}`;
    ougiCard?.remove();

    const modes = ['SA', 'DA', 'TA'].map((label) => ({ label, card: byLabel.get(label) }));
    if (modes.some((entry) => !entry.card)) continue;

    const compact = document.createElement('div');
    compact.className = 'analysis-stat attack-modes-compact';

    const label = document.createElement('span');
    label.textContent = 'SA / DA / TA';
    compact.append(label);

    const summaries = modes.map((entry) => attackModeSummary(entry.card!));
    const primary = document.createElement('strong');
    primary.textContent = summaries.map((entry) => entry.count).join(' / ');
    compact.append(primary);

    const secondary = document.createElement('small');
    const percentages = summaries.map((entry) => entry.percent).join(' / ');
    const damages = summaries
      .map((entry, index) => entry.damage ? `${modes[index]!.label} ${entry.damage}` : undefined)
      .filter((entry): entry is string => Boolean(entry));
    secondary.textContent = damages.length ? `${percentages} · ${damages.join(' · ')}` : percentages;
    compact.append(secondary);

    const first = modes[0]!.card!;
    grid.insertBefore(compact, first);
    for (const entry of modes) entry.card!.remove();
  }
}

function moveCockpitSelectedAnalysisInline(root: HTMLElement): void {
  for (const cockpit of root.querySelectorAll<HTMLElement>('.preset-combat-cockpit')) {
    const selected = cockpit.querySelector<HTMLElement>('button.cockpit-row.selected');
    const detail = cockpit.querySelector<HTMLDetailsElement>('.cockpit-selected-analysis');
    if (!selected || !detail) continue;

    detail.classList.add('cockpit-inline-analysis');
    detail.open = true;
    selected.insertAdjacentElement('afterend', detail);
  }
}

function labelCockpitSummons(root: HTMLElement): void {
  for (const strip of root.querySelectorAll<HTMLElement>('.preset-combat-cockpit .summon-strip')) {
    const cards = [...strip.querySelectorAll<HTMLElement>(':scope > .summon-card')];
    addSummonRole(cards[0], 'Main');
    if (cards.length >= 6) addSummonRole(cards[5], 'Support');
  }
}

function addSummonRole(card: HTMLElement | undefined, role: 'Main' | 'Support'): void {
  if (!card) return;
  let label = card.querySelector<HTMLElement>(':scope > .summon-role-label');
  if (!label) {
    label = document.createElement('span');
    label.className = 'summon-role-label';
    card.prepend(label);
  }
  label.textContent = role;
  if (role === 'Support') card.classList.add('supporter-slot');
}

function attackModeSummary(card: HTMLElement): { count: string; percent: string; damage?: string } {
  const primary = card.querySelector<HTMLElement>(':scope > strong')?.textContent?.trim() ?? '—';
  const [count = '—', percent = '—'] = primary.split('·').map((part) => part.trim());
  const detail = card.querySelector<HTMLElement>(':scope > small')?.textContent?.trim() ?? '';
  if (!detail || detail === 'not source-proven') return { count, percent };
  const damage = (detail.split('·').at(-1)?.trim() ?? '')
    .replace(/\s+damage$/i, ' dmg');
  return { count, percent, damage: damage || undefined };
}

function alignHistoricalLoadouts(root: HTMLElement): void {
  for (const owner of root.querySelectorAll<HTMLElement>('[data-history-layout-owner]')) {
    const localId = owner.dataset.historyLayoutOwner;
    const mount = owner.parentElement;
    if (!localId || !mount?.classList.contains('raid-section-body')) continue;
    const loadout = [...mount.querySelectorAll<HTMLDetailsElement>('.combat-loadout-section')]
      .find((candidate) => candidate.dataset.loadoutOwner === `history:${localId}`);
    if (!loadout) continue;

    const summons = owner.querySelector<HTMLDetailsElement>('.combat-accordion[data-combat-collapse="summons"]');
    if (summons) {
      const parent = summons.parentElement;
      if (parent?.classList.contains('preset-cypher-grid') || parent?.classList.contains('party-first-row')) {
        let side = parent.querySelector<HTMLElement>(':scope > .combat-loadout-side-column');
        if (!side) {
          side = document.createElement('div');
          side.className = 'combat-loadout-side-column';
          summons.replaceWith(side);
          side.append(summons);
        }
        side.append(loadout);
      } else {
        summons.after(loadout);
      }
      continue;
    }

    const compactPartySummons = owner.querySelector<HTMLElement>('.compact-party-summons');
    if (compactPartySummons) compactPartySummons.after(loadout);
  }
}
