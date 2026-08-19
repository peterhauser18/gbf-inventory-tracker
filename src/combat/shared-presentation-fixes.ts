export function applySharedCombatPresentationFixes(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.analysis-stat > span').forEach((label) => {
    if (label.textContent?.trim() !== 'Ougi') return;
    const card = label.parentElement;
    if (!card?.querySelector('small')) return;
    label.textContent = 'Ougi uses';
  });

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
