import { serializeRaidParse } from './export.ts';
import { CombatDashboardControllerV2 as RaidDashboardController } from './dashboard-v2.ts';
import { renderCombatLayout, type CombatLayoutPreset } from './layouts.ts';
import {
  getActiveCombatRaids,
  manualFinalizeActiveRaid,
  type ActiveCombatRaid,
} from './storage.ts';
import {
  EMPTY_ENTITY_METADATA,
  loadWikiEntityMetadata,
  type EntityMetadataIndex,
} from '../dashboard/wiki-metadata.ts';

export class CombatDashboardControllerV2 {
  private readonly raidsController: RaidDashboardController;
  private active: ActiveCombatRaid[] = [];
  private metadata: EntityMetadataIndex = EMPTY_ENTITY_METADATA;
  private metadataLoadStarted = false;
  private readonly selectedActorByRaid = new Map<string, string>();
  private readonly collapsedByRaid = new Map<string, Set<string>>();
  private readonly onChanged: () => void;

  constructor(onChanged: () => void) {
    this.onChanged = onChanged;
    this.raidsController = new RaidDashboardController(onChanged);
  }

  async refresh(): Promise<void> {
    const [active] = await Promise.all([
      getActiveCombatRaids(),
      this.raidsController.refresh(),
    ]);
    this.active = active;
    this.ensureMetadata();
  }

  renderCombat(layout: CombatLayoutPreset): string {
    if (!this.active.length) {
      return '<div class="empty"><strong>No active combat parse observed</strong><span>Joined or hosted raids appear here independently after their verified battle start response is observed.</span></div>';
    }

    return `<div class="active-combat-list">${this.active.map((entry, index) => this.renderActiveRaid(entry, index, layout)).join('')}</div>`;
  }

  renderRaids(query: string): string {
    return this.raidsController.renderRaids(query);
  }

  bind(root: HTMLElement): void {
    const activeCards = root.querySelectorAll<HTMLElement>('[data-active-combat-key]');
    if (!activeCards.length) {
      this.raidsController.bind(root);
      return;
    }

    for (const card of activeCards) {
      const key = card.dataset.activeCombatKey;
      if (!key) continue;

      card.querySelectorAll<HTMLButtonElement>('[data-character-select]').forEach((button) => {
        button.addEventListener('click', () => {
          const actorId = button.dataset.characterSelect;
          if (!actorId) return;
          this.selectedActorByRaid.set(key, actorId);
          this.onChanged();
        });
      });

      card.querySelectorAll<HTMLDetailsElement>('[data-combat-collapse]').forEach((details) => {
        details.addEventListener('toggle', () => {
          const section = details.dataset.combatCollapse;
          if (!section) return;
          const collapsed = this.collapsedByRaid.get(key) ?? new Set<string>();
          if (details.open) collapsed.delete(section);
          else collapsed.add(section);
          this.collapsedByRaid.set(key, collapsed);
        });
      });

      card.querySelector<HTMLButtonElement>('[data-active-raid-export]')?.addEventListener('click', () => this.exportActiveRaid(key));
      card.querySelector<HTMLButtonElement>('[data-active-raid-finalize]')?.addEventListener('click', () => void this.finalizeActiveRaid(key));
      card.querySelectorAll<HTMLImageElement>('[data-combat-image]').forEach((image) => {
        image.addEventListener('error', () => image.remove(), { once: true });
      });
    }
  }

  private renderActiveRaid(entry: ActiveCombatRaid, index: number, layout: CombatLayoutPreset): string {
    const collapsed = this.collapsedByRaid.get(entry.key) ?? new Set<string>();
    const selectedActorId = this.selectedActorByRaid.get(entry.key) ?? null;
    const label = this.active.length > 1 ? `Active raid ${index + 1} of ${this.active.length}` : 'Active raid';
    const layoutMarkup = renderCombatLayout(layout, {
      raid: entry.parse,
      context: entry.context ?? null,
      metadata: this.metadata,
      selectedActorId,
      collapsedSections: collapsed,
    });

    return `<article class="active-combat-card" data-active-combat-key="${escapeAttribute(entry.key)}">
      <div class="active-combat-card-label"><span>${label}</span><span>${escapeHtml(entry.parse.instanceId ? `Instance ${shortInstance(entry.parse.instanceId)}` : 'Instance id not observed')}</span></div>
      ${layoutMarkup}
      <div class="active-combat-footer">
        <span class="muted">Local parser state only. Manual finalization sends no GBF request.</span>
        <div class="active-combat-actions">
          <button type="button" data-active-raid-export>Export JSON</button>
          <button class="danger-outline" type="button" data-active-raid-finalize>Raid manuell abschließen</button>
        </div>
      </div>
    </article>`;
  }

  private exportActiveRaid(key: string): void {
    const raid = this.active.find((entry) => entry.key === key)?.parse;
    if (!raid) return;
    const blob = new Blob([serializeRaidParse(raid)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gbf-active-raid-${safeFilename(raid.raidTechnicalId)}-${raid.lastObservedAt}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async finalizeActiveRaid(key: string): Promise<void> {
    const raid = this.active.find((entry) => entry.key === key)?.parse;
    if (!raid) return;
    const confirmed = window.confirm(
      `Raid "${raid.raidName ?? raid.raidTechnicalId}" lokal abschließen? Der Tracker markiert kein Victory/Defeat ohne beobachtetes Terminal-Event.`,
    );
    if (!confirmed) return;
    await manualFinalizeActiveRaid(key);
    this.selectedActorByRaid.delete(key);
    this.collapsedByRaid.delete(key);
    await this.refresh();
    this.onChanged();
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
}

function shortInstance(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'raid';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
