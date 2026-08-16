export interface FarmingMaterial {
  key: string;
  name: string;
  state: 'known' | 'unknown';
  required: number;
  missing?: number;
  itemId?: string;
  wikiTitle?: string;
}

export interface FarmingDrop {
  itemId: string;
  name?: string;
  quantity: number;
}

export interface FarmingRaidRecord {
  raidTechnicalId: string;
  raidName?: string;
  dropsQuality: 'known' | 'partial' | 'unknown';
  drops: FarmingDrop[];
}

export interface FarmingDropPreference {
  raidTechnicalId: string;
  pinnedItemIds: string[];
  importantItemIds: string[];
  updatedAt: number;
}

export interface WikiRaidSource {
  name: string;
  target: string;
  sourceUrl: string;
}

export interface WikiMaterialRaidSources {
  wikiTitle: string;
  sourceUrl: string;
  state: 'known' | 'unavailable';
  freshness?: string;
  raids: WikiRaidSource[];
  limitation?: string;
}

export interface PersonalRaidEvidence {
  raidTechnicalId: string;
  raidName?: string;
  itemId?: string;
  eligibleRuns: number;
  observedDropRuns?: number;
  quantityReceived?: number;
  appearanceRate?: number;
  quantityPerEligibleRun?: number;
  estimatedRunsRemaining?: number;
  tracked: boolean;
}

export interface FarmingSourceEvidence {
  wiki: WikiRaidSource;
  personal?: PersonalRaidEvidence;
}

export interface FarmingFocusEntry {
  material: FarmingMaterial;
  wiki?: WikiMaterialRaidSources;
  sources: FarmingSourceEvidence[];
}

export function parseWikiObtainRaidSources(
  wikitext: string,
  wikiTitle: string,
  sourceUrl: string,
  freshness?: string,
): WikiMaterialRaidSources {
  const obtain = extractObtainSection(wikitext);
  if (!obtain) {
    return unavailableWikiSources(wikiTitle, sourceUrl, 'The material page did not expose a recognizable Obtain section.', freshness);
  }

  const byKey = new Map<string, WikiRaidSource>();
  let dropGroupDepth: number | undefined;
  for (const line of obtain.split(/\r?\n/)) {
    const bullet = line.match(/^(\*+)\s*(.*)$/);
    if (!bullet) {
      dropGroupDepth = undefined;
      continue;
    }
    const depth = bullet[1]!.length;
    const body = bullet[2] ?? '';
    if (dropGroupDepth !== undefined && depth <= dropGroupDepth) dropGroupDepth = undefined;

    const plain = cleanWikiText(body.replace(/\[\[[^\]]+\]\]/g, ' '));
    const explicitDrop = /\b(?:drop|drops|dropped)\s+from\b/i.test(plain)
      || /\braid\s+drops?\b/i.test(plain);
    const startsDropGroup = /\b(?:drop|drops|dropped)\b\s*:?[\s.]*$/i.test(plain)
      || /\bdrops?\s+from\s*:?[\s.]*$/i.test(plain);
    if (startsDropGroup) dropGroupDepth = depth;
    const inheritedDrop = dropGroupDepth !== undefined && depth > dropGroupDepth;

    const linkMatches = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g)];
    const dropFrom = /\b(?:drop|drops|dropped)\s+from\b/i.exec(body);
    const firstAfterDropFrom = dropFrom
      ? linkMatches.findIndex((match) => (match.index ?? -1) >= (dropFrom.index + dropFrom[0].length))
      : -1;

    for (const [linkIndex, match] of linkMatches.entries()) {
      const target = cleanWikiText(match[1] ?? '');
      const label = cleanWikiText(match[2] ?? target);
      if (!target || !label) continue;
      const explicitPlainSource = firstAfterDropFrom >= 0
        ? linkIndex === firstAfterDropFrom
        : explicitDrop && linkIndex === 0;
      const groupedPlainSource = (inheritedDrop || startsDropGroup) && linkIndex === 0;
      if (!looksLikeRaidLink(target, label) && !explicitPlainSource && !groupedPlainSource) continue;
      const name = displayRaidName(target, label);
      const key = normalizeRaidName(name, false);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        name,
        target,
        sourceUrl: wikiPageUrl(target),
      });
    }
  }

  const raids = [...byKey.values()];
  if (!raids.length) {
    return unavailableWikiSources(
      wikiTitle,
      sourceUrl,
      'The Wiki Obtain section was found, but no raid link could be classified safely.',
      freshness,
    );
  }

  return {
    wikiTitle,
    sourceUrl,
    state: 'known',
    freshness,
    raids,
  };
}

export function unavailableWikiSources(
  wikiTitle: string,
  sourceUrl: string,
  limitation: string,
  freshness?: string,
): WikiMaterialRaidSources {
  return { wikiTitle, sourceUrl, state: 'unavailable', freshness, raids: [], limitation };
}

export function buildFarmingFocus(
  materials: readonly FarmingMaterial[],
  wikiByTitle: ReadonlyMap<string, WikiMaterialRaidSources>,
  raids: readonly FarmingRaidRecord[],
  preferences: readonly FarmingDropPreference[],
): FarmingFocusEntry[] {
  return materials
    .filter((material) => material.state === 'unknown' || (material.missing ?? 0) > 0)
    .map((material) => {
      const title = material.wikiTitle?.trim();
      const wiki = title ? wikiByTitle.get(normalizeWikiTitle(title)) : undefined;
      const sources = wiki?.state === 'known'
        ? wiki.raids.map((source) => buildSourceEvidence(material, source, raids, preferences))
        : [];
      return { material, wiki, sources };
    })
    .sort((left, right) => {
      const leftKnown = left.material.state === 'known' ? 0 : 1;
      const rightKnown = right.material.state === 'known' ? 0 : 1;
      if (leftKnown !== rightKnown) return leftKnown - rightKnown;
      const sourceDelta = Number(right.sources.length > 0) - Number(left.sources.length > 0);
      if (sourceDelta !== 0) return sourceDelta;
      const missingDelta = (right.material.missing ?? -1) - (left.material.missing ?? -1);
      if (missingDelta !== 0) return missingDelta;
      return left.material.name.localeCompare(right.material.name);
    });
}

export function ensureRaidDropTracked(
  preference: FarmingDropPreference | undefined,
  raidTechnicalId: string,
  itemId: string,
  updatedAt = Date.now(),
): FarmingDropPreference {
  const current = preference ?? {
    raidTechnicalId,
    pinnedItemIds: [],
    importantItemIds: [],
    updatedAt,
  };
  if (current.pinnedItemIds.includes(itemId) && current.importantItemIds.includes(itemId)) return current;
  return {
    raidTechnicalId,
    pinnedItemIds: sortedUnique([...current.pinnedItemIds, itemId]),
    importantItemIds: sortedUnique([...current.importantItemIds, itemId]),
    updatedAt,
  };
}

export function estimatePersonalRunsRemaining(
  missing: number | undefined,
  eligibleRuns: number,
  quantityReceived: number,
): number | undefined {
  if (!Number.isFinite(missing) || (missing ?? 0) <= 0) return undefined;
  if (!Number.isInteger(eligibleRuns) || eligibleRuns <= 0) return undefined;
  if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) return undefined;
  const average = quantityReceived / eligibleRuns;
  if (!Number.isFinite(average) || average <= 0) return undefined;
  return Math.ceil((missing as number) / average);
}

export function normalizeWikiTitle(value: string): string {
  return value.trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();
}

function buildSourceEvidence(
  material: FarmingMaterial,
  wiki: WikiRaidSource,
  raids: readonly FarmingRaidRecord[],
  preferences: readonly FarmingDropPreference[],
): FarmingSourceEvidence {
  const identity = matchLocalRaid(wiki.name, raids);
  if (!identity) return { wiki };

  const itemId = resolveMaterialItemId(material, raids.filter((raid) => raid.raidTechnicalId === identity.raidTechnicalId));
  if (!itemId) {
    return {
      wiki,
      personal: {
        raidTechnicalId: identity.raidTechnicalId,
        raidName: identity.raidName,
        eligibleRuns: countEligibleRuns(raids, identity.raidTechnicalId),
        tracked: false,
      },
    };
  }

  const summary = summarizePersonalDrop(raids, identity.raidTechnicalId, itemId);
  const preference = preferences.find((entry) => entry.raidTechnicalId === identity.raidTechnicalId);
  const tracked = Boolean(
    preference?.pinnedItemIds.includes(itemId)
    && preference.importantItemIds.includes(itemId),
  );
  return {
    wiki,
    personal: {
      raidTechnicalId: identity.raidTechnicalId,
      raidName: identity.raidName,
      itemId,
      eligibleRuns: summary.eligibleRuns,
      observedDropRuns: summary.observedDropRuns,
      quantityReceived: summary.quantityReceived,
      appearanceRate: summary.eligibleRuns > 0 ? summary.observedDropRuns / summary.eligibleRuns : undefined,
      quantityPerEligibleRun: summary.eligibleRuns > 0 ? summary.quantityReceived / summary.eligibleRuns : undefined,
      estimatedRunsRemaining: material.state === 'known'
        ? estimatePersonalRunsRemaining(material.missing, summary.eligibleRuns, summary.quantityReceived)
        : undefined,
      tracked,
    },
  };
}

function summarizePersonalDrop(
  raids: readonly FarmingRaidRecord[],
  raidTechnicalId: string,
  itemId: string,
): { eligibleRuns: number; observedDropRuns: number; quantityReceived: number } {
  const eligible = raids.filter((raid) => raid.raidTechnicalId === raidTechnicalId && raid.dropsQuality === 'known');
  const observedDropRuns = eligible.filter((raid) => raid.drops.some((drop) => drop.itemId === itemId)).length;
  const quantityReceived = eligible.reduce(
    (sum, raid) => sum + raid.drops
      .filter((drop) => drop.itemId === itemId)
      .reduce((inner, drop) => inner + safeQuantity(drop.quantity), 0),
    0,
  );
  return { eligibleRuns: eligible.length, observedDropRuns, quantityReceived };
}

function resolveMaterialItemId(material: FarmingMaterial, raids: readonly FarmingRaidRecord[]): string | undefined {
  if (material.itemId?.trim()) return material.itemId.trim();
  const names = new Set([
    normalizeItemName(material.name),
    material.wikiTitle ? normalizeItemName(material.wikiTitle) : '',
  ].filter(Boolean));
  const ids = new Set<string>();
  for (const raid of raids) {
    for (const drop of raid.drops) {
      if (!drop.name || !names.has(normalizeItemName(drop.name))) continue;
      ids.add(drop.itemId);
    }
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

function matchLocalRaid(
  wikiName: string,
  raids: readonly FarmingRaidRecord[],
): { raidTechnicalId: string; raidName?: string } | undefined {
  const named = raids.filter((raid) => raid.raidName?.trim());
  const exactKey = normalizeRaidName(wikiName, false);
  const exact = uniqueRaidIdentities(named.filter((raid) => normalizeRaidName(raid.raidName ?? '', false) === exactKey));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;

  const relaxedKey = normalizeRaidName(wikiName, true);
  const relaxed = uniqueRaidIdentities(named.filter((raid) => normalizeRaidName(raid.raidName ?? '', true) === relaxedKey));
  return relaxed.length === 1 ? relaxed[0] : undefined;
}

function uniqueRaidIdentities(raids: readonly FarmingRaidRecord[]): Array<{ raidTechnicalId: string; raidName?: string }> {
  const byId = new Map<string, { raidTechnicalId: string; raidName?: string }>();
  for (const raid of raids) {
    if (!byId.has(raid.raidTechnicalId)) byId.set(raid.raidTechnicalId, { raidTechnicalId: raid.raidTechnicalId, raidName: raid.raidName });
  }
  return [...byId.values()];
}

function countEligibleRuns(raids: readonly FarmingRaidRecord[], raidTechnicalId: string): number {
  return raids.filter((raid) => raid.raidTechnicalId === raidTechnicalId && raid.dropsQuality === 'known').length;
}

function extractObtainSection(wikitext: string): string | undefined {
  const lines = wikitext.split(/\r?\n/);
  const start = lines.findIndex((line) => /^={2,}\s*Obtain(?:ed)?\s*={2,}\s*$/i.test(line.trim()));
  if (start < 0) return undefined;
  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^={2,}\s*.+?\s*={2,}\s*$/.test(line.trim())) break;
    collected.push(line);
  }
  return collected.join('\n');
}

function looksLikeRaidLink(target: string, label: string): boolean {
  if (/^Raids:/i.test(target)) return true;
  const value = `${target} ${label}`;
  return /\((?:Raid|Impossible|Hard)\)\s*$/i.test(target)
    || /\((?:Raid|Impossible|Hard)\)\s*$/i.test(label)
    || /\bNightmare(?:\s+\d+)?\s*$/i.test(value);
}

function displayRaidName(target: string, label: string): string {
  if (label && label !== target) return label;
  return target.replace(/^Raids:/i, '').replace(/_/g, ' ').trim();
}

function normalizeRaidName(value: string, relaxed: boolean): string {
  let normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/_/g, ' ');
  if (relaxed) normalized = normalized.replace(/\((?:raid|impossible|hard)\)\s*$/i, ' ');
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeItemName(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function cleanWikiText(value: string): string {
  return value.replace(/<!--.*?-->/g, '').replace(/\{\{.*?\}\}/g, '').trim();
}

function wikiPageUrl(title: string): string {
  return `https://gbf.wiki/${encodeURIComponent(title.trim().replace(/\s+/g, '_')).replace(/%2F/gi, '/')}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function safeQuantity(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
