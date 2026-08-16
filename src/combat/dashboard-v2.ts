import './styles.css';
import {
  buildCharacterAnalyses,
  buildGlobalPinnedDrops,
  sortRaidHistoryForDisplay,
  summarizeTurns,
} from './analytics.ts';
import { filterRaidHistory, toggleTrackedItem } from './aggregate.ts';
import { serializeRaidParse } from './export.ts';
import { renderCombatLayout, type CombatLayoutPreset } from './layouts.ts';
import type { CombatParseContext } from './multiraid.ts';
import {
  getAllDropPreferences,
  getCombatLiveContext,
  getLatestCombatParse,
  getRaidHistory,
  importRaidParseJson,
  saveDropPreferences,
  updateRaidLocalState,
} from './storage.ts';
import type { RaidDropPreferences, RaidHistoryRecord, WikiDropReference } from './types.ts';
import { loadWikiDropReferences } from './wiki.ts';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadataIndex,
} from '../dashboard/wiki-metadata.ts';

export class CombatDashboardControllerV2 {
  private latest = null as Awaited<ReturnType<typeof getLatestCombatParse>>;
  private liveContext: CombatParseContext | null = null;
  private history: RaidHistoryRecord[] = [];
  private preferences: RaidDropPreferences[] = [];
  private metadata: EntityMetadataIndex = EMPTY_ENTITY_METADATA;
  private metadataLoadStarted = false;
  private selectedActorId: string | null = null;
  private readonly collapsedCombatSections = new Set<string>();
  private readonly collapsedRaidCombat = new Set<string>();
  private readonly collapsedRaidDrops = new Set<string>();
  private readonly wikiReferences = new Map<string, WikiDropReference>();
  private readonly onChanged: () => void;

  constructor(onChanged: () => void) {
    this.onChanged = onChanged;
  }

  async refresh(): Promise<void> {
    const [latest, liveContext, history, preferences] = await Promise.all([
      getLatestCombatParse(),
      getCombatLiveContext(),
      getRaidHistory(),
      getAllDropPreferences(),
    ]);
    this.latest = latest;
    this.liveContext = liveContext ?? null;
    this.history = history;
    this.preferences = preferences;
    this.ensureMetadata();
  }

  renderCombat(layout: CombatLayoutPreset): string {
    if (!this.latest) {
      return '<div class="empty"><strong>No combat parse observed yet</strong><span>Combat data appears here from eligible responses already received during normal play.</span></div>';
    }
    return renderCombatLayout(layout, {
      raid: this.latest,
      context: this.liveContext?.raidTechnicalId === this.latest.raidTechnicalId ? this.liveContext : null,
      metadata: this.metadata,
      selectedActorId: this.selectedActorId,
      collapsedSections: this.collapsedCombatSections,
    });
  }

  renderRaids(query: string): string {
    const ordered = sortRaidHistoryForDisplay(this.history);
    const raids = filterRaidHistory(ordered, query, this.preferences);
    const pins = buildGlobalPinnedDrops(this.history, this.preferences);
    return `
      <div class="raid-toolbar">
        <label class="import-button">Import normalized parse<input type="file" accept="application/json,.json" data-raid-import hidden /></label>
        <span class="muted">${formatNumber(raids.length)} of ${formatNumber(this.history.length)} local raid records</span>
      </div>
      ${this.renderGlobalPins(pins)}
      ${raids.length
        ? `<div class="raid-list">${raids.map((raid) => this.renderRaid(raid)).join('')}</div>`
        : '<div class="empty"><strong>No matching raid records</strong><span>Completed/left raids appear only when enough normalized identifying data was observed.</span></div>'}
    `;
  }

  bind(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>('[data-character-select]').forEach((button) => {
      button.addEventListener('click', () => {
        this.selectedActorId = button.dataset.characterSelect ?? null;
        this.onChanged();
      });
    });

    root.querySelectorAll<HTMLDetailsElement>('[data-combat-collapse]').forEach((details) => {
      details.addEventListener('toggle', () => this.rememberDetails(details, this.collapsedCombatSections, 'combatCollapse'));
    });
    root.querySelectorAll<HTMLDetailsElement>('[data-raid-combat-collapse]').forEach((details) => {
      details.addEventListener('toggle', () => this.rememberDetails(details, this.collapsedRaidCombat, 'raidCombatCollapse'));
    });
    root.querySelectorAll<HTMLDetailsElement>('[data-raid-drops-collapse]').forEach((details) => {
      details.addEventListener('toggle', () => this.rememberDetails(details, this.collapsedRaidDrops, 'raidDropsCollapse'));
    });

    root.querySelector<HTMLInputElement>('[data-raid-import]')?.addEventListener('change', (event) => void this.importFile(event));
    root.querySelectorAll<HTMLButtonElement>('[data-raid-export]').forEach((button) => button.addEventListener('click', () => this.exportRaid(button.dataset.raidExport ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-raid-favorite]').forEach((button) => button.addEventListener('click', () => void this.toggleFavorite(button.dataset.raidFavorite ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-save-note]').forEach((button) => button.addEventListener('click', () => void this.saveNote(root, button.dataset.saveNote ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-track-item]').forEach((button) => button.addEventListener('click', () => void this.toggleTracked(button)));
    root.querySelectorAll<HTMLButtonElement>('[data-wiki-rate]').forEach((button) => button.addEventListener('click', () => void this.loadWikiReference(button)));
    root.querySelectorAll<HTMLImageElement>('[data-combat-image]').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
  }

  private ensureMetadata(): void {
    if (this.metadataLoadStarted) return;
    this.metadataLoadStarted = true;
    void loadWikiEntityMetadata()
      .then((metadata) => {
        this.metadata = metadata;
        this.onChanged();
      })
      .catch(() => {});
  }

  private rememberDetails(
    details: HTMLDetailsElement,
    store: Set<string>,
    datasetKey: 'combatCollapse' | 'raidCombatCollapse' | 'raidDropsCollapse',
  ): void {
    const key = details.dataset[datasetKey];
    if (!key) return;
    if (details.open) store.delete(key);
    else store.add(key);
  }

  private renderGlobalPins(pins: ReturnType<typeof buildGlobalPinnedDrops>): string {
    if (!pins.length) return '';
    return `<section class="global-pins">
      <div class="global-pins-head"><div><p class="eyebrow">PINNED DROPS</p><h3>Tracked across raids</h3></div><span class="muted">${formatNumber(pins.length)} pinned</span></div>
      <div class="global-pin-grid">${pins.map((pin) => {
        const wiki = this.wikiReferences.get(wikiKey(pin.raidTechnicalId, pin.itemId));
        return `<article class="global-pin-card">
          <div><span class="muted">${escapeHtml(pin.raidName ?? pin.raidTechnicalId)}</span><strong>${escapeHtml(pin.itemName ?? pin.itemId)}</strong></div>
          <div class="global-pin-rate"><strong>${pin.observedDrops}/${pin.eligibleRuns}</strong><span>${pin.rate === undefined ? 'personal rate —' : `${(pin.rate * 100).toFixed(2)}% personal observed`}</span></div>
          <span class="muted">${formatNumber(pin.quantityReceived)} total qty${pin.important ? ' · ★ important' : ''}</span>
          ${wiki ? renderWikiReference(wiki) : `<button class="wiki-rate-button" type="button" data-wiki-rate="${escapeAttribute(pin.itemId)}" data-raid-id="${escapeAttribute(pin.raidTechnicalId)}" data-raid-name="${escapeAttribute(pin.raidName ?? '')}" data-item-name="${escapeAttribute(pin.itemName ?? pin.itemId)}">Load GBF Wiki reference</button>`}
          <button class="pin-remove" type="button" data-track-item="${escapeAttribute(pin.itemId)}" data-raid-id="${escapeAttribute(pin.raidTechnicalId)}" data-track-kind="pinned">Unpin</button>
        </article>`;
      }).join('')}</div>
    </section>`;
  }

  private renderRaid(raid: RaidHistoryRecord): string {
    const preference = this.preferences.find((entry) => entry.raidTechnicalId === raid.raidTechnicalId);
    const combatOpen = !this.collapsedRaidCombat.has(raid.localId);
    const dropsOpen = !this.collapsedRaidDrops.has(raid.localId);
    return `<article class="raid-card ${raid.favorite ? 'favorite' : ''}">
      <div class="raid-head">
        <div><p class="eyebrow">${escapeHtml(raid.result.toUpperCase())}</p><h3>${escapeHtml(raid.raidName ?? raid.raidTechnicalId)}</h3><p class="muted">${formatDate(raid.observedEndedAt ?? raid.lastObservedAt)} · ${escapeHtml(raid.raidTechnicalId)}</p></div>
        <div class="raid-actions"><button type="button" data-raid-favorite="${escapeAttribute(raid.localId)}">${raid.favorite ? '★ Favorite' : '☆ Favorite'}</button><button type="button" data-raid-export="${escapeAttribute(raid.localId)}">Export JSON</button></div>
      </div>
      <details class="raid-section" data-raid-combat-collapse="${escapeAttribute(raid.localId)}"${combatOpen ? ' open' : ''}>
        <summary>Combat data</summary>
        <div class="raid-section-body">${this.renderRaidCombat(raid)}</div>
      </details>
      <details class="raid-section" data-raid-drops-collapse="${escapeAttribute(raid.localId)}"${dropsOpen ? ' open' : ''}>
        <summary>Drops · ${formatNumber(raid.drops.length)}</summary>
        <div class="raid-section-body">${this.renderRaidDrops(raid, preference)}</div>
      </details>
      <div class="raid-note"><textarea data-note-id="${escapeAttribute(raid.localId)}" rows="2" placeholder="Local note">${escapeHtml(raid.note ?? '')}</textarea><button type="button" data-save-note="${escapeAttribute(raid.localId)}">Save note</button></div>
    </article>`;
  }

  private renderRaidCombat(raid: RaidHistoryRecord): string {
    const analyses = buildCharacterAnalyses(raid);
    const turns = summarizeTurns(raid);
    const honors = raid.participants?.honors ?? raid.participants?.contribution;
    const boss = raid.boss?.hp === undefined
      ? '—'
      : `${formatNumber(raid.boss.hp)}${raid.boss.maxHp === undefined ? '' : ` / ${formatNumber(raid.boss.maxHp)}`}`;
    return `<div class="raid-combat-summary">
      <div><span>Boss HP</span><strong>${boss}</strong></div><div><span>Party damage</span><strong>${optionalNumber(raid.partyDamage)}</strong></div><div><span>Honors</span><strong>${optionalNumber(honors)}</strong></div><div><span>Last observed turn</span><strong>${turns.currentTurn ?? '—'}</strong></div>
    </div>
    ${analyses.length ? `<div class="raid-combat-table"><div class="raid-combat-row head"><span>Character</span><span>Total</span><span>Normal</span><span>Skill</span><span>Ougi</span></div>${analyses.map((analysis) => `<div class="raid-combat-row"><strong>${escapeHtml(analysis.actorName ?? analysis.actorId)}</strong><span>${formatNumber(analysis.totalDamage)}</span><span>${optionalNumber(analysis.breakdown.normal)}</span><span>${optionalNumber(analysis.breakdown.skill)}</span><span>${optionalNumber(analysis.breakdown.ougi)}</span></div>`).join('')}</div>` : '<p class="muted">No attributed character damage in this record.</p>'}
    ${raid.log.length ? `<details class="raid-log-mini"><summary>Observed actions · ${formatNumber(raid.log.length)}</summary><div>${raid.log.slice(-50).reverse().map((entry) => `<div class="raid-log-row"><span>${entry.turn === undefined ? 'T—' : `T${entry.turn}`}</span><strong>${escapeHtml(entry.actorName ?? entry.actorId ?? 'Actor unavailable')}</strong><span>${escapeHtml(entry.actionName ?? entry.actionKind)}</span><span>${formatNumber(entry.damage)}</span></div>`).join('')}</div></details>` : ''}`;
  }

  private renderRaidDrops(raid: RaidHistoryRecord, preference: RaidDropPreferences | undefined): string {
    if (!raid.drops.length) {
      return `<p class="muted raid-empty-drops">${raid.dropsQuality === 'known' ? 'No drops recorded in this complete reward result.' : 'Drop result incomplete or unavailable; absence is not treated as zero.'}</p>`;
    }
    return `<div class="raid-drop-table"><div class="raid-drop-grid head"><span>Drop</span><span>Qty</span><span>Chest/source</span><span>Important</span><span>Pinned</span></div>${raid.drops.map((drop) => {
      const important = preference?.importantItemIds.includes(drop.itemId) ?? false;
      const pinned = preference?.pinnedItemIds.includes(drop.itemId) ?? false;
      return `<div class="raid-drop-grid"><strong>${escapeHtml(drop.name ?? drop.itemId)}</strong><span>${formatNumber(drop.quantity)}</span><span>${escapeHtml(drop.chest ?? '—')}</span><button type="button" data-track-item="${escapeAttribute(drop.itemId)}" data-raid-id="${escapeAttribute(raid.raidTechnicalId)}" data-track-kind="important" aria-label="Toggle important">${important ? '★' : '☆'}</button><button type="button" data-track-item="${escapeAttribute(drop.itemId)}" data-raid-id="${escapeAttribute(raid.raidTechnicalId)}" data-track-kind="pinned">${pinned ? '📌 Unpin' : 'Pin'}</button></div>`;
    }).join('')}</div>`;
  }

  private async importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await importRaidParseJson(await file.text());
    input.value = '';
    await this.refresh();
    this.onChanged();
  }

  private exportRaid(localId: string): void {
    const raid = this.history.find((entry) => entry.localId === localId);
    if (!raid) return;
    const blob = new Blob([serializeRaidParse(raid)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gbf-raid-${safeFilename(raid.raidTechnicalId)}-${raid.observedEndedAt ?? raid.lastObservedAt}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async toggleFavorite(localId: string): Promise<void> {
    const raid = this.history.find((entry) => entry.localId === localId);
    if (!raid) return;
    await updateRaidLocalState(localId, { favorite: !raid.favorite });
    await this.refresh();
    this.onChanged();
  }

  private async saveNote(root: HTMLElement, localId: string): Promise<void> {
    const textarea = Array.from(root.querySelectorAll<HTMLTextAreaElement>('[data-note-id]')).find((entry) => entry.dataset.noteId === localId);
    if (!textarea) return;
    await updateRaidLocalState(localId, { note: textarea.value });
    await this.refresh();
    this.onChanged();
  }

  private async toggleTracked(button: HTMLButtonElement): Promise<void> {
    const raidTechnicalId = button.dataset.raidId;
    const itemId = button.dataset.trackItem;
    const kind = button.dataset.trackKind;
    if (!raidTechnicalId || !itemId || (kind !== 'pinned' && kind !== 'important')) return;
    const current = this.preferences.find((entry) => entry.raidTechnicalId === raidTechnicalId);
    await saveDropPreferences(toggleTrackedItem(current, raidTechnicalId, itemId, kind));
    await this.refresh();
    this.onChanged();
  }

  private async loadWikiReference(button: HTMLButtonElement): Promise<void> {
    const raidTechnicalId = button.dataset.raidId;
    const raidName = button.dataset.raidName;
    const itemId = button.dataset.wikiRate;
    const itemName = button.dataset.itemName;
    if (!raidTechnicalId || !raidName || !itemId || !itemName) return;
    try {
      const refs = await loadWikiDropReferences(raidName, [itemName]);
      const reference = refs.get(itemName);
      if (reference) this.wikiReferences.set(wikiKey(raidTechnicalId, itemId), reference);
    } catch {
      this.wikiReferences.set(wikiKey(raidTechnicalId, itemId), {
        state: 'unavailable',
        sourceUrl: `https://gbf.wiki/${encodeURIComponent(raidName.replace(/\s+/g, '_'))}`,
        limitation: 'Public wiki lookup failed; no rate is inferred.',
      });
    }
    this.onChanged();
  }
}

function renderWikiReference(reference: WikiDropReference): string {
  const rate = reference.state === 'precise' && reference.ratePercent !== undefined
    ? `${reference.ratePercent}%`
    : reference.state === 'qualitative'
      ? reference.label ?? 'qualitative'
      : 'unavailable';
  return `<div class="wiki-reference"><strong>GBF Wiki: ${escapeHtml(rate)}</strong>${reference.chest ? `<span>${escapeHtml(reference.chest)}</span>` : ''}${reference.freshness ? `<span>${escapeHtml(reference.freshness)}</span>` : ''}<a href="${escapeAttribute(reference.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Source ↗</a></div>`;
}

function wikiKey(raidTechnicalId: string, itemId: string): string {
  return `${raidTechnicalId}:${itemId}`;
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? '—' : formatNumber(value);
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatDate(value: number): string {
  return new Date(value).toLocaleString();
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'raid';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
