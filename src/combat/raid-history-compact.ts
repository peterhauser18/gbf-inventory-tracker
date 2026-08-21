import './raid-history-compact.css';

export function applyCompactRaidHistory(root: HTMLElement, _query: string): void {
  flattenRaidCards(root);

  const toolbar = root.querySelector<HTMLElement>('.raid-toolbar');
  if (toolbar) {
    toolbar.classList.add('raid-toolbar-bottom');
    if (toolbar !== root.lastElementChild) root.append(toolbar);
  }
}

function flattenRaidCards(root: HTMLElement): void {
  for (const card of root.querySelectorAll<HTMLElement>('.raid-card')) {
    card.querySelector<HTMLElement>(':scope > .raid-head')?.classList.add('raid-history-tools-only');
    const combat = card.querySelector<HTMLDetailsElement>(':scope > .raid-section[data-raid-combat-collapse]');
    if (!combat) continue;
    combat.classList.add('raid-combat-flat');
    combat.open = true;
    combat.querySelector<HTMLElement>(':scope > summary')?.remove();
  }
}
