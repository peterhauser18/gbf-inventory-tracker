import './cockpit-viewport-layout.css';

export function applyCockpitViewportLayout(root: HTMLElement): void {
  for (const cockpit of root.querySelectorAll<HTMLElement>('.preset-combat-cockpit')) {
    const secondary = cockpit.querySelector<HTMLElement>(':scope > .cockpit-secondary');
    if (!secondary) continue;
    secondary.classList.add('cockpit-secondary-below');
    cockpit.after(secondary);
  }
}
