import './styles.css';
import { filterRaidHistory, summarizeTrackedDrop, toggleTrackedItem } from './aggregate.ts';
import { serializeRaidParse } from './export.ts';
import {
  getAllDropPreferences,
  getLatestCombatParse,
  getRaidHistory,
  importRaidParseJson,
  saveDropPreferences,
  updateRaidLocalState,
} from './storage.ts';
import type { NormalizedRaidParse, RaidDropPreferences, RaidHistoryRecord, WikiDropReference } from './types.ts';
import { loadWikiDropReferences } from './wiki.ts';

export class CombatDashboardController {
  private latest: NormalizedRaidParse | null = null;
  private history: RaidHistoryRecord[] = [];
  private preferences: RaidDropPreferences[] = [];
  private readonly wikiReferences = new Map<string, WikiDropReference>();
  private readonly onChanged: () => void;

  constructor(onChanged: () => void) { this.onChanged = onChanged; }

  async refresh(): Promise<void> {
    const [latest, history, preferences] = await Promise.all([getLatestCombatParse(), getRaidHistory(), getAllDropPreferences()]);
    this.latest = latest;
    this.history = history;
    this.preferences = preferences;
  }

  renderCombat(): string {
    const raid = this.latest;
    if (!raid) return '<div class="empty"><strong>No combat parse observed yet</strong><span>Combat data appears here only from eligible responses already received while passive observation is running.</span></div>';
    const bossHp = raid.boss?.hp !== undefined
      ? `${formatNumber(raid.boss.hp)}${raid.boss.maxHp !== undefined ? ` / ${formatNumber(raid.boss.maxHp)}` : ''}${raid.boss.hpPercent !== undefined ? ` (${raid.boss.hpPercent.toFixed(1)}%)` : ''}`
      : 'unknown';
    const participant = raid.participants;
    return `
      <section class="overview-grid combat-metrics">
        ${metric('Raid', raid.raidName ?? raid.raidTechnicalId, raid.parserQuality)}
        ${metric('Result', raid.result, raid.resultQuality)}
        ${metric('Boss HP', bossHp, raid.boss?.quality ?? 'unknown')}
        ${metric('Party damage', raid.partyDamage === undefined ? 'unknown' : formatNumber(raid.partyDamage), raid.damageQuality)}
        ${metric('Honors', participant?.honors === undefined ? 'unknown' : formatNumber(participant.honors), participant?.quality ?? 'unknown')}
        ${metric('Participants', participant?.count === undefined ? 'unknown' : formatNumber(participant.count), participant?.quality ?? 'unknown')}
      </section>
      <section class="combat-panel">
        <div class="combat-heading"><div><p class="eyebrow">DAMAGE</p><h3>Party breakdown</h3></div>${qualityChip(raid.damageQuality)}</div>
        ${raid.characterDamage.length ? `
          <div class="combat-table" role="table">
            <div class="combat-row header" role="row"><span>Character</span><span>Total</span><span>Normal</span><span>Skill</span><span>Ougi</span><span>Echo</span><span>Supp.</span></div>
            ${raid.characterDamage.map((entry) => `<div class="combat-row" role="row">
              <span>${escapeHtml(entry.actorName ?? entry.actorId)}</span><strong>${formatNumber(entry.total)}</strong>
              <span>${optionalNumber(entry.breakdown.normal)}</span><span>${optionalNumber(entry.breakdown.skill)}</span>
              <span>${optionalNumber(entry.breakdown.ougi)}</span><span>${optionalNumber(entry.breakdown.echo)}</span><span>${optionalNumber(entry.breakdown.supplemental)}</span>
            </div>`).join('')}
          </div>` : '<p class="muted">No supported damage actions have been observed for this raid.</p>'}
      </section>
      <section class="combat-panel">
        <div class="combat-heading"><div><p class="eyebrow">OBSERVED STATS</p><h3>Combat facts</h3></div>${qualityChip(raid.stats.quality)}</div>
        <div class="combat-stat-grid">${smallStat('Attack actions', raid.stats.attackActions)}${smallStat('Multiattacks', raid.stats.multiattacks)}${smallStat('Critical hits', raid.stats.criticalHits)}${smallStat('Skills used', raid.stats.skillsUsed)}${smallStat('Ougis used', raid.stats.ougisUsed)}${smallStat('Role', raid.role)}</div>
      </section>
      <section class="combat-panel">
        <div class="combat-heading"><div><p class="eyebrow">LOG</p><h3>Observed actions</h3></div><span class="muted">${raid.log.length} entries</span></div>
        ${raid.log.length ? `<div class="combat-log">${raid.log.slice(-100).reverse().map((entry) => `<div class="combat-log-row"><span>${entry.turn === undefined ? 'Turn ?' : `Turn ${entry.turn}`}</span><strong>${escapeHtml(entry.actorName ?? entry.actorId ?? 'Unknown actor')}</strong><span>${escapeHtml(entry.actionName ?? entry.actionKind)}</span><span>${formatNumber(entry.damage)} dmg</span></div>`).join('')}</div>` : '<p class="muted">No supported action events observed.</p>'}
      </section>`;
  }

  renderRaids(query: string): string {
    const raids = filterRaidHistory(this.history, query, this.preferences);
    return `<div class="raid-toolbar"><label class="import-button">Import normalized parse<input type="file" accept="application/json,.json" data-raid-import hidden /></label><span class="muted">${raids.length} of ${this.history.length} local raid records</span></div>${raids.length ? `<div class="raid-list">${raids.map((raid) => this.renderRaid(raid)).join('')}</div>` : '<div class="empty"><strong>No matching raid records</strong><span>Completed/left raids appear only when enough normalized identifying data was observed.</span></div>'}`;
  }

  bind(root: HTMLElement): void {
    root.querySelector<HTMLInputElement>('[data-raid-import]')?.addEventListener('change', (event) => void this.importFile(event));
    root.querySelectorAll<HTMLButtonElement>('[data-raid-export]').forEach((button) => button.addEventListener('click', () => this.exportRaid(button.dataset.raidExport ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-raid-favorite]').forEach((button) => button.addEventListener('click', () => void this.toggleFavorite(button.dataset.raidFavorite ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-save-note]').forEach((button) => button.addEventListener('click', () => void this.saveNote(root, button.dataset.saveNote ?? '')));
    root.querySelectorAll<HTMLButtonElement>('[data-track-item]').forEach((button) => button.addEventListener('click', () => void this.toggleTracked(button)));
    root.querySelectorAll<HTMLButtonElement>('[data-wiki-rate]').forEach((button) => button.addEventListener('click', () => void this.loadWikiReference(button)));
  }

  private renderRaid(raid: RaidHistoryRecord): string {
    const preference = this.preferences.find((entry) => entry.raidTechnicalId === raid.raidTechnicalId);
    const totalRuns = this.history.filter((entry) => entry.raidTechnicalId === raid.raidTechnicalId).length;
    const pinned = preference?.pinnedItemIds ?? [];
    return `<article class="raid-card ${raid.favorite ? 'favorite' : ''}">
      <div class="raid-head"><div><p class="eyebrow">${escapeHtml(raid.result.toUpperCase())}</p><h3>${escapeHtml(raid.raidName ?? raid.raidTechnicalId)}</h3><p class="muted">${formatDate(raid.observedEndedAt ?? raid.lastObservedAt)} · ${escapeHtml(raid.raidTechnicalId)} · ${totalRuns} observed runs</p></div><div class="raid-actions"><button type="button" data-raid-favorite="${escapeAttribute(raid.localId)}">${raid.favorite ? '★ Favorite' : '☆ Favorite'}</button><button type="button" data-raid-export="${escapeAttribute(raid.localId)}">Export JSON</button></div></div>
      ${pinned.length ? `<section class="tracked-grid">${pinned.map((itemId) => this.renderTrackedSummary(raid, itemId)).join('')}</section>` : '<p class="muted">No pinned drops for this raid type yet.</p>'}
      <div class="raid-drops"><div class="combat-row header"><span>Drop</span><span>Qty</span><span>Chest/source</span><span>Important</span><span>Pinned</span><span></span><span></span></div>
        ${raid.drops.length ? raid.drops.map((drop) => {
          const important = preference?.importantItemIds.includes(drop.itemId) ?? false;
          const isPinned = preference?.pinnedItemIds.includes(drop.itemId) ?? false;
          return `<div class="combat-row raid-drop-row"><strong>${escapeHtml(drop.name ?? drop.itemId)}</strong><span>${formatNumber(drop.quantity)}</span><span>${escapeHtml(drop.chest ?? 'unknown')}</span><button type="button" data-track-item="${escapeAttribute(drop.itemId)}" data-raid-id="${escapeAttribute(raid.raidTechnicalId)}" data-track-kind="important">${important ? '★' : '☆'}</button><button type="button" data-track-item="${escapeAttribute(drop.itemId)}" data-raid-id="${escapeAttribute(raid.raidTechnicalId)}" data-track-kind="pinned">${isPinned ? '📌' : 'Pin'}</button><span></span><span></span></div>`;
        }).join('') : `<div class="muted raid-empty-drops">${raid.dropsQuality === 'known' ? 'No drops recorded in this complete reward result.' : 'Drop result unavailable or partial; absence is not treated as zero.'}</div>`}
      </div>
      <div class="raid-note"><textarea data-note-id="${escapeAttribute(raid.localId)}" rows="2" placeholder="Local note">${escapeHtml(raid.note ?? '')}</textarea><button type="button" data-save-note="${escapeAttribute(raid.localId)}">Save note</button></div>
    </article>`;
  }

  private renderTrackedSummary(raid: RaidHistoryRecord, itemId: string): string {
    const summary = summarizeTrackedDrop(this.history, raid.raidTechnicalId, itemId);
    const dropped = raid.drops.some((drop) => drop.itemId === itemId);
    const droppedState = dropped ? 'yes' : raid.dropsQuality === 'known' ? 'no' : 'unknown';
    const wiki = this.wikiReferences.get(wikiKey(raid.raidTechnicalId, itemId));
    const itemName = summary.itemName ?? itemId;
    return `<article class="tracked-card"><div class="tracked-title"><strong>${escapeHtml(itemName)}</strong><span>${droppedState === 'yes' ? 'Dropped this run' : droppedState === 'no' ? 'Did not drop this run' : 'Run drop state unknown'}</span></div><div class="tracked-rate"><strong>${summary.observedDrops}/${summary.eligibleRuns}</strong><span>personal observed rate${summary.rate === undefined ? '' : ` · ${(summary.rate * 100).toFixed(2)}%`}</span></div><span class="muted">${formatNumber(summary.quantityReceived)} total quantity in eligible runs</span>${wiki ? renderWikiReference(wiki) : `<button class="wiki-rate-button" type="button" data-wiki-rate="${escapeAttribute(itemId)}" data-raid-id="${escapeAttribute(raid.raidTechnicalId)}" data-raid-name="${escapeAttribute(raid.raidName ?? '')}" data-item-name="${escapeAttribute(itemName)}">Load GBF Wiki reference</button>`}</article>`;
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
    const raidTechnicalId = button.dataset.raidId, itemId = button.dataset.trackItem, kind = button.dataset.trackKind;
    if (!raidTechnicalId || !itemId || (kind !== 'pinned' && kind !== 'important')) return;
    const current = this.preferences.find((entry) => entry.raidTechnicalId === raidTechnicalId);
    await saveDropPreferences(toggleTrackedItem(current, raidTechnicalId, itemId, kind));
    await this.refresh();
    this.onChanged();
  }

  private async loadWikiReference(button: HTMLButtonElement): Promise<void> {
    const raidTechnicalId = button.dataset.raidId, raidName = button.dataset.raidName, itemId = button.dataset.wikiRate, itemName = button.dataset.itemName;
    if (!raidTechnicalId || !raidName || !itemId || !itemName) return;
    try {
      const refs = await loadWikiDropReferences(raidName, [itemName]);
      const reference = refs.get(itemName);
      if (reference) this.wikiReferences.set(wikiKey(raidTechnicalId, itemId), reference);
    } catch {
      this.wikiReferences.set(wikiKey(raidTechnicalId, itemId), { state: 'unavailable', sourceUrl: `https://gbf.wiki/${encodeURIComponent(raidName.replace(/\s+/g, '_'))}`, limitation: 'Public GBF Wiki reference could not be loaded.' });
    }
    this.onChanged();
  }
}

function renderWikiReference(reference: WikiDropReference): string {
  const rate = reference.state === 'precise' ? `${reference.ratePercent}%` : reference.state === 'qualitative' ? reference.label ?? 'qualitative' : 'unavailable';
  const context = [reference.chest, reference.sampleSize !== undefined ? `n=${formatNumber(reference.sampleSize)}` : undefined, reference.freshness].filter(Boolean).join(' · ');
  return `<div class="wiki-reference"><span>GBF Wiki reference: <strong>${escapeHtml(rate)}</strong></span>${context ? `<span>${escapeHtml(context)}</span>` : ''}${reference.limitation ? `<span>${escapeHtml(reference.limitation)}</span>` : ''}<a href="${escapeAttribute(reference.sourceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Source ↗</a></div>`;
}
function metric(label: string, value: string, quality: 'known' | 'partial' | 'unknown'): string { return `<article class="metric-card"><div class="metric-head"><span>${escapeHtml(label)}</span>${qualityChip(quality)}</div><strong>${escapeHtml(value)}</strong></article>`; }
function smallStat(label: string, value: string | number | undefined): string { return `<div><span>${escapeHtml(label)}</span><strong>${value === undefined ? '?' : escapeHtml(typeof value === 'number' ? formatNumber(value) : value)}</strong></div>`; }
function qualityChip(quality: 'known' | 'partial' | 'unknown'): string { return `<span class="quality ${quality}">${quality}</span>`; }
function optionalNumber(value: number | undefined): string { return value === undefined ? '?' : formatNumber(value); }
function formatNumber(value: number): string { return new Intl.NumberFormat('en-US').format(value); }
function formatDate(timestamp: number): string { return timestamp > 0 ? new Date(timestamp).toLocaleString() : 'unknown time'; }
function safeFilename(value: string): string { return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'raid'; }
function wikiKey(raidId: string, itemId: string): string { return `${raidId}:${itemId}`; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
