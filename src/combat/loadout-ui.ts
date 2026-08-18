import './loadout.css';
import { normalizeWikiTitle } from '../dashboard/farming.ts';
import { loadWikiMaterialThumbnails } from '../dashboard/wiki-assets.ts';
import { readPersistedRaidLoadouts } from './loadout-read.ts';
import type { RaidLoadoutSnapshot, RaidLoadoutWeapon, RaidWeaponSkillBoost } from './loadout-types.ts';

type RenderTarget = {
  owner: string;
  mount: HTMLElement;
  loadout?: RaidLoadoutSnapshot;
};

export async function decorateCombatLoadouts(root: HTMLElement): Promise<void> {
  const targets = await collectTargets(root);
  const pending = targets.filter((target) => {
    const current = target.mount.querySelector<HTMLElement>(':scope > .combat-loadout-panel');
    return current?.dataset.loadoutFingerprint !== loadoutFingerprint(target.loadout);
  });
  if (!pending.length) return;
  const weaponNames = [...new Set(pending.flatMap((target) => target.loadout?.weapons.flatMap((weapon) => weapon.name ? [weapon.name] : []) ?? []))];
  let thumbnails: ReadonlyMap<string, string | undefined> = new Map();
  if (weaponNames.length) {
    try {
      thumbnails = await loadWikiMaterialThumbnails(weaponNames);
    } catch {
      // Public wiki artwork is optional; observed loadout facts remain usable without it.
    }
  }

  for (const target of pending) {
    if (!target.mount.isConnected) continue;
    const current = target.mount.querySelector<HTMLElement>(':scope > .combat-loadout-panel');
    const fingerprint = loadoutFingerprint(target.loadout);
    if (current?.dataset.loadoutFingerprint === fingerprint) continue;
    const next = document.createElement('section');
    next.className = 'combat-loadout-panel';
    next.dataset.loadoutOwner = target.owner;
    next.dataset.loadoutFingerprint = fingerprint;
    next.innerHTML = renderLoadout(target.loadout, thumbnails);
    current?.remove();
    const activeLabel = target.mount.querySelector<HTMLElement>(':scope > .active-combat-card-label');
    if (activeLabel) activeLabel.after(next);
    else target.mount.prepend(next);
    next.querySelectorAll<HTMLImageElement>('[data-loadout-image]').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
  }
}

async function collectTargets(root: HTMLElement): Promise<RenderTarget[]> {
  const persisted = await readPersistedRaidLoadouts();
  const targets: RenderTarget[] = [];
  for (const card of root.querySelectorAll<HTMLElement>('[data-active-combat-key]')) {
    const key = card.dataset.activeCombatKey;
    if (!key) continue;
    targets.push({ owner: `active:${key}`, mount: card, loadout: persisted.active.get(key) });
  }
  for (const card of root.querySelectorAll<HTMLElement>('.raid-card')) {
    const localId = card.querySelector<HTMLButtonElement>('[data-raid-export]')?.dataset.raidExport;
    const mount = card.querySelector<HTMLElement>('[data-raid-combat-collapse] .raid-section-body');
    if (!localId || !mount) continue;
    targets.push({ owner: `history:${localId}`, mount, loadout: persisted.history.get(localId) });
  }
  return targets;
}

function renderLoadout(
  loadout: RaidLoadoutSnapshot | undefined,
  thumbnails: ReadonlyMap<string, string | undefined>,
): string {
  if (!loadout || loadout.weaponGridQuality === 'unknown') {
    return `<div class="combat-loadout-unknown">
      <div><p class="eyebrow">BATTLE LOADOUT</p><h3>Weapon Grid — Unknown</h3></div>
      <span>Waiting for a matching passive Party deck observation.</span>
    </div>`;
  }

  const main = loadout.weapons.find((weapon) => weapon.slot === 1);
  const regular = loadout.weapons.filter((weapon) => weapon.slot >= 2 && weapon.slot <= 10);
  const additional = loadout.weapons.filter((weapon) => weapon.slot > 10);
  const totalHp = sumWeaponStat(loadout.weapons, 'hp');
  const totalAttack = sumWeaponStat(loadout.weapons, 'attack');
  const exLabel = additional.length ? `EX · ${loadout.weapons.length} weapons` : `${loadout.weapons.length} weapons`;

  return `<div class="combat-loadout-head">
      <div><p class="eyebrow">BATTLE LOADOUT</p><h3>Weapon Grid</h3><span class="muted">${escapeHtml(exLabel)}${loadout.deckId ? ` · Deck ${escapeHtml(loadout.deckId)}` : ''}</span></div>
      <div class="combat-loadout-totals"><div><span>Total HP</span><strong>${formatNumber(totalHp)}</strong></div><div><span>Total ATK</span><strong>${formatNumber(totalAttack)}</strong></div></div>
    </div>
    <div class="combat-weapon-grid-shell">
      <div class="combat-main-weapon"><span class="combat-grid-label">MAIN WEAPON</span>${main ? renderWeapon(main, thumbnails, true) : renderMissingWeapon(1)}</div>
      <div class="combat-regular-weapons">${regular.map((weapon) => renderWeapon(weapon, thumbnails, false)).join('')}</div>
    </div>
    ${additional.length ? `<div class="combat-additional-weapons"><div class="combat-additional-label"><strong>Additional Weapons</strong><span>EX Party</span></div><div class="combat-additional-grid">${additional.map((weapon) => renderWeapon(weapon, thumbnails, false)).join('')}</div></div>` : ''}
    ${renderCalculator(loadout)}
  `;
}

function renderWeapon(
  weapon: RaidLoadoutWeapon,
  thumbnails: ReadonlyMap<string, string | undefined>,
  main: boolean,
): string {
  const imageUrl = weapon.name ? thumbnails.get(normalizeWikiTitle(weapon.name)) : undefined;
  const plus = weapon.plus && weapon.plus > 0 ? `<span class="weapon-plus">+${formatNumber(weapon.plus)}</span>` : '';
  return `<article class="combat-weapon-card${main ? ' main' : ''}" title="${escapeAttribute(weapon.name ?? weapon.masterId ?? `Weapon slot ${weapon.slot}`)}">
    <div class="combat-weapon-art">${imageUrl ? `<img data-loadout-image src="${escapeAttribute(imageUrl)}" alt="" referrerpolicy="no-referrer" />` : `<span>${weapon.slot}</span>`}${plus}</div>
    <div class="combat-weapon-name"><span>Slot ${weapon.slot}</span><strong>${escapeHtml(weapon.name ?? weapon.masterId ?? 'Observed weapon')}</strong></div>
    <div class="combat-weapon-stats"><span>◆ ${optionalNumber(weapon.hp)}</span><span>⚔ ${optionalNumber(weapon.attack)}</span></div>
  </article>`;
}

function renderMissingWeapon(slot: number): string {
  return `<article class="combat-weapon-card main missing"><div class="combat-weapon-art"><span>${slot}</span></div><div class="combat-weapon-name"><span>Slot ${slot}</span><strong>Unknown</strong></div></article>`;
}

function renderCalculator(loadout: RaidLoadoutSnapshot): string {
  const calculator = loadout.calculator;
  if (calculator.quality === 'unknown') {
    return `<div class="combat-skill-boosts unknown"><strong>Weapon Skill Boosts — Unknown</strong><span>Calculator data has not been passively observed for this deck.</span></div>`;
  }
  const enhance = calculator.enhancement;
  return `<div class="combat-calculator">
    <div class="combat-calculator-summary">
      <div><span>Estimated DMG</span><strong>${optionalNumber(calculator.estimatedDamage)}</strong></div>
      <div><span>Estimated DMG to ${escapeHtml(attributeName(calculator.advantageAttribute))}</span><strong>${optionalNumber(calculator.estimatedAdvantageDamage)}</strong></div>
      <div><span>Max HP</span><strong>${optionalNumber(calculator.maxHp)}</strong></div>
    </div>
    <div class="combat-enhancement-row">
      <span class="combat-boost-heading">Weapon Skill Enhancements</span>
      <div><span>Normal</span><strong>${optionalPercent(enhance.normal)}</strong></div>
      <div><span>Magna</span><strong>${optionalPercent(enhance.magna)}</strong></div>
      <div><span>Other</span><strong>${optionalPercent(enhance.other)}</strong></div>
    </div>
    ${calculator.boosts.length ? `<div class="combat-skill-boosts"><span class="combat-boost-heading">Weapon Skill Boosts</span><div class="combat-boost-grid">${calculator.boosts.map(renderBoost).join('')}</div></div>` : ''}
  </div>`;
}

function renderBoost(boost: RaidWeaponSkillBoost): string {
  const category = boost.iconId.startsWith('01_') ? 'offense' : boost.iconId.startsWith('02_') ? 'defense' : boost.iconId.startsWith('03_') ? 'health' : 'cap';
  return `<div class="combat-boost-chip ${category}${boost.maxed ? ' maxed' : ''}" title="${escapeAttribute(boost.iconId)}"><span>${escapeHtml(boost.label)}</span><strong>${escapeHtml(boost.value ?? '—')}</strong></div>`;
}

function loadoutFingerprint(loadout: RaidLoadoutSnapshot | undefined): string {
  return loadout ? `${loadout.updatedAt}:${loadout.weaponGridQuality}:${loadout.calculator.quality}:${loadout.weapons.length}` : 'missing';
}

function sumWeaponStat(weapons: readonly RaidLoadoutWeapon[], key: 'hp' | 'attack'): number | undefined {
  const values = weapons.flatMap((weapon) => weapon[key] === undefined ? [] : [weapon[key] as number]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function attributeName(attribute: number | undefined): string {
  const names: Record<number, string> = { 1: 'Fire', 2: 'Water', 3: 'Earth', 4: 'Wind', 5: 'Light', 6: 'Dark' };
  return attribute === undefined ? 'Advantage' : `${names[attribute] ?? `Attribute ${attribute}`} Foes`;
}

function optionalPercent(value: number | undefined): string {
  return value === undefined ? '—' : `${formatNumber(value)}%`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? '—' : formatNumber(value);
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
