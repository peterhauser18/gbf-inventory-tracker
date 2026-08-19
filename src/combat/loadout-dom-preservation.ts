export type PreservedCombatLoadout =
  | {
      owner: string;
      kind: 'weapon-panel';
      node: HTMLElement;
    }
  | {
      owner: string;
      kind: 'loadout';
      node: HTMLDetailsElement;
    };

const cockpitViewByGroup = new Map<string, number>();

export function detachCombatLoadouts(root: HTMLElement): PreservedCombatLoadout[] {
  rememberCockpitViews(root);
  const preserved: PreservedCombatLoadout[] = [];

  // The weapon grid is static for a running raid. Preserve the entire scrollable
  // Weapons panel as one DOM island while the surrounding live combat markup is
  // refreshed. Keeping the same element preserves its scroll position and loaded
  // image nodes without making turn/attack updates redraw the grid.
  for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
    const key = card.dataset.activeCombatKey;
    if (!key) continue;
    const panel = card.querySelector<HTMLElement>('.cockpit-loadout-panel[data-cockpit-loadout-panel="weapons"]');
    if (!panel) continue;
    preserved.push({ owner: `active:${key}`, kind: 'weapon-panel', node: panel });
    panel.remove();
  }

  // Preserve standalone/history loadout details, plus non-cockpit active layouts.
  // Active Combat Cockpit loadouts inside the preserved Weapons panel are already
  // detached with their parent and therefore are intentionally not visited here.
  for (const node of root.querySelectorAll<HTMLDetailsElement>('.combat-loadout-section[data-loadout-owner]')) {
    const owner = node.dataset.loadoutOwner;
    if (!owner) continue;
    preserved.push({ owner, kind: 'loadout', node });
    node.remove();
  }
  return preserved;
}

export function restoreCombatLoadouts(root: HTMLElement, preserved: readonly PreservedCombatLoadout[]): void {
  restoreCockpitViews(root);

  for (const entry of preserved) {
    if (entry.kind !== 'weapon-panel') continue;
    const target = findTarget(root, entry.owner);
    if (!target) continue;
    restorePreservedWeaponPanel(target, entry.node);
  }

  for (const entry of preserved) {
    if (entry.kind !== 'loadout') continue;
    const target = findTarget(root, entry.owner);
    if (!target) continue;
    placePreservedLoadout(entry.owner, target, entry.node);
  }
}

function rememberCockpitViews(root: HTMLElement): void {
  for (const cockpit of root.querySelectorAll<HTMLElement>('[data-cockpit-loadout]')) {
    const inputs = [...cockpit.querySelectorAll<HTMLInputElement>('.cockpit-tab-input')];
    const group = inputs[0]?.name;
    const selected = inputs.findIndex((input) => input.checked);
    if (group && selected >= 0) cockpitViewByGroup.set(group, selected);
  }
}

function restoreCockpitViews(root: HTMLElement): void {
  for (const cockpit of root.querySelectorAll<HTMLElement>('[data-cockpit-loadout]')) {
    const inputs = [...cockpit.querySelectorAll<HTMLInputElement>('.cockpit-tab-input')];
    const group = inputs[0]?.name;
    const selected = group ? cockpitViewByGroup.get(group) : undefined;
    const input = selected === undefined ? undefined : inputs[selected];
    if (input) input.checked = true;
  }
}

function findTarget(root: HTMLElement, owner: string): HTMLElement | undefined {
  if (owner.startsWith('active:')) {
    const key = owner.slice('active:'.length);
    return [...root.querySelectorAll<HTMLElement>('[data-active-combat-key]')]
      .find((candidate) => candidate.dataset.activeCombatKey === key);
  }

  if (owner.startsWith('history:')) {
    const localId = owner.slice('history:'.length);
    for (const card of root.querySelectorAll<HTMLElement>('.raid-card')) {
      if (card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport !== localId) continue;
      return card.querySelector<HTMLElement>('[data-raid-combat-collapse] .raid-section-body') ?? undefined;
    }
  }

  return undefined;
}

function restorePreservedWeaponPanel(mount: HTMLElement, panel: HTMLElement): void {
  const replacement = mount.querySelector<HTMLElement>('.cockpit-loadout-panel[data-cockpit-loadout-panel="weapons"]');
  if (!replacement) return;
  replacement.replaceWith(panel);
}

function placePreservedLoadout(owner: string, mount: HTMLElement, node: HTMLDetailsElement): void {
  const cockpitWeaponSlot = mount.querySelector<HTMLElement>('[data-cockpit-weapon-slot]');
  if (cockpitWeaponSlot) {
    node.open = true;
    cockpitWeaponSlot.replaceChildren(node);
    return;
  }

  if (!owner.startsWith('active:')) {
    mount.prepend(node);
    return;
  }

  const summons = mount.querySelector<HTMLDetailsElement>('.combat-accordion[data-combat-collapse="summons"]');
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
      side.append(node);
    } else {
      summons.after(node);
    }
    return;
  }

  const compactPartySummons = mount.querySelector<HTMLElement>('.compact-party-summons');
  if (compactPartySummons) {
    compactPartySummons.after(node);
    return;
  }

  const preset = mount.querySelector<HTMLElement>('.combat-preset');
  const liveStats = preset?.querySelector<HTMLElement>('.combat-live-stats');
  if (liveStats) {
    liveStats.after(node);
    return;
  }

  mount.prepend(node);
}
