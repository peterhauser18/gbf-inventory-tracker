export type PreservedCombatImage = {
  raidKey: string;
  src: string;
  node: HTMLImageElement;
};

export type PreservedCombatBossIcon = {
  raidKey: string;
  node: HTMLElement;
};

export type PreservedCombatScroll = {
  raidKey: string;
  selector: string;
  top: number;
  left: number;
};

export type PreservedCombatDetails = {
  raidKey: string;
  section: string;
  open: boolean;
};

export type PreservedStableCombatDom = {
  images: PreservedCombatImage[];
  bossIcons: PreservedCombatBossIcon[];
  scroll: PreservedCombatScroll[];
  details: PreservedCombatDetails[];
};

export function detachStableCombatDom(root: HTMLElement): PreservedStableCombatDom {
  const bossIcons: PreservedCombatBossIcon[] = [];
  const scroll: PreservedCombatScroll[] = [];
  const details: PreservedCombatDetails[] = [];

  for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
    const raidKey = card.dataset.activeCombatKey;
    if (!raidKey) continue;

    const bossIcon = card.querySelector<HTMLElement>('.combat-boss-icon');
    if (bossIcon) {
      bossIcons.push({ raidKey, node: bossIcon });
      bossIcon.remove();
    }

    rememberScroll(card, raidKey, '.cockpit-table', scroll);
    for (const panel of card.querySelectorAll<HTMLElement>('.cockpit-loadout-panel[data-cockpit-loadout-panel]')) {
      const key = panel.dataset.cockpitLoadoutPanel;
      if (key) rememberScroll(card, raidKey, `.cockpit-loadout-panel[data-cockpit-loadout-panel="${cssEscape(key)}"]`, scroll);
    }

    for (const panel of card.querySelectorAll<HTMLDetailsElement>('.cockpit-secondary-panel[data-combat-collapse]')) {
      const section = panel.dataset.combatCollapse;
      if (section) details.push({ raidKey, section, open: panel.open });
    }
  }

  const images: PreservedCombatImage[] = [];
  for (const image of root.querySelectorAll<HTMLImageElement>('img[data-combat-image]')) {
    const src = image.getAttribute('src');
    const raidKey = image.closest<HTMLElement>('[data-active-combat-key]')?.dataset.activeCombatKey;
    if (!raidKey || !src || !image.complete || image.naturalWidth <= 0) continue;
    images.push({ raidKey, src, node: image });
    image.remove();
  }

  return { images, bossIcons, scroll, details };
}

export function restoreStableCombatDom(root: HTMLElement, preserved: PreservedStableCombatDom): void {
  for (const entry of preserved.bossIcons) {
    const card = findRaidCard(root, entry.raidKey);
    const title = card?.querySelector<HTMLElement>('.combat-raid-title');
    if (!title || title.querySelector('.combat-boss-icon')) continue;
    title.classList.add('has-boss-icon');
    title.prepend(entry.node);
  }

  const imageQueues = new Map<string, HTMLImageElement[]>();
  for (const entry of preserved.images) {
    const key = imageKey(entry.raidKey, entry.src);
    const queue = imageQueues.get(key) ?? [];
    queue.push(entry.node);
    imageQueues.set(key, queue);
  }
  for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
    const raidKey = card.dataset.activeCombatKey;
    if (!raidKey) continue;
    for (const replacement of card.querySelectorAll<HTMLImageElement>('img[data-combat-image]')) {
      const src = replacement.getAttribute('src');
      if (!src) continue;
      const preservedImage = imageQueues.get(imageKey(raidKey, src))?.shift();
      if (preservedImage) replacement.replaceWith(preservedImage);
    }
  }

  for (const entry of preserved.details) {
    const card = findRaidCard(root, entry.raidKey);
    if (!card) continue;
    const panel = [...card.querySelectorAll<HTMLDetailsElement>('.cockpit-secondary-panel[data-combat-collapse]')]
      .find((candidate) => candidate.dataset.combatCollapse === entry.section);
    if (panel) panel.open = entry.open;
  }

  for (const entry of preserved.scroll) {
    const card = findRaidCard(root, entry.raidKey);
    const element = card?.querySelector<HTMLElement>(entry.selector);
    if (!element) continue;
    element.scrollTop = entry.top;
    element.scrollLeft = entry.left;
  }
}

function rememberScroll(
  card: HTMLElement,
  raidKey: string,
  selector: string,
  target: PreservedCombatScroll[],
): void {
  const element = card.querySelector<HTMLElement>(selector);
  if (!element || element.scrollTop === 0 && element.scrollLeft === 0) return;
  target.push({ raidKey, selector, top: element.scrollTop, left: element.scrollLeft });
}

function findRaidCard(root: HTMLElement, raidKey: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[data-active-combat-key]')]
    .find((candidate) => candidate.dataset.activeCombatKey === raidKey);
}

function imageKey(raidKey: string, src: string): string {
  return `${raidKey}\u0000${src}`;
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, (character) => `\\${character}`);
}
