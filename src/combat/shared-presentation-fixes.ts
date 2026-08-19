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
}

export function isTechnicalMainCharacterLabel(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return false;
  return /(?:^|_)sp(?:_|$)/i.test(text) && /\d/.test(text);
}
