import type { DropRateSummary, RaidDropPreferences, RaidHistoryRecord } from './types.ts';

export function summarizeTrackedDrop(
  raids: RaidHistoryRecord[],
  raidTechnicalId: string,
  itemId: string,
): DropRateSummary {
  const eligible = raids.filter((raid) => raid.raidTechnicalId === raidTechnicalId && raid.dropsQuality === 'known');
  const observedDrops = eligible.filter((raid) => raid.drops.some((drop) => drop.itemId === itemId)).length;
  const quantityReceived = eligible.reduce(
    (sum, raid) => sum + raid.drops.filter((drop) => drop.itemId === itemId).reduce((inner, drop) => inner + drop.quantity, 0),
    0,
  );
  const itemName = raids
    .flatMap((raid) => raid.drops)
    .find((drop) => drop.itemId === itemId)?.name;
  return {
    raidTechnicalId,
    itemId,
    itemName,
    observedDrops,
    eligibleRuns: eligible.length,
    quantityReceived,
    rate: eligible.length > 0 ? observedDrops / eligible.length : undefined,
  };
}

export function filterRaidHistory(
  raids: RaidHistoryRecord[],
  query: string,
  preferences: RaidDropPreferences[],
): RaidHistoryRecord[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return raids;
  const prefs = new Map(preferences.map((entry) => [entry.raidTechnicalId, entry]));
  return raids.filter((raid) => {
    const preference = prefs.get(raid.raidTechnicalId);
    const trackedIds = new Set([...(preference?.pinnedItemIds ?? []), ...(preference?.importantItemIds ?? [])]);
    const trackedDrops = raid.drops.filter((drop) => trackedIds.has(drop.itemId));
    const date = raid.observedEndedAt ? new Date(raid.observedEndedAt).toISOString() : '';
    return [
      raid.raidTechnicalId,
      raid.raidName ?? '',
      date,
      ...trackedDrops.flatMap((drop) => [drop.itemId, drop.name ?? '']),
    ].some((value) => value.toLowerCase().includes(normalized));
  });
}

export function toggleTrackedItem(
  preference: RaidDropPreferences | undefined,
  raidTechnicalId: string,
  itemId: string,
  kind: 'pinned' | 'important',
  updatedAt = Date.now(),
): RaidDropPreferences {
  const current: RaidDropPreferences = preference ?? {
    raidTechnicalId,
    pinnedItemIds: [],
    importantItemIds: [],
    updatedAt,
  };
  const key = kind === 'pinned' ? 'pinnedItemIds' : 'importantItemIds';
  const values = new Set(current[key]);
  if (values.has(itemId)) values.delete(itemId); else values.add(itemId);
  return { ...current, [key]: [...values].sort(), updatedAt };
}
