import type { DamageBreakdown, NormalizedRaidParse, RaidHistoryRecord } from './types.ts';

export interface RaidParseExport {
  format: 'gbf-tool-raid-parse';
  version: 1;
  raid: NormalizedRaidParse;
}

export function buildRaidParseExport(record: RaidHistoryRecord | NormalizedRaidParse): RaidParseExport {
  return { format: 'gbf-tool-raid-parse', version: 1, raid: sanitizeRaidParse(record) };
}

export function serializeRaidParse(record: RaidHistoryRecord | NormalizedRaidParse): string {
  return JSON.stringify(buildRaidParseExport(record), null, 2);
}

export function parseRaidParseExport(value: string): NormalizedRaidParse {
  const parsed = JSON.parse(value) as unknown;
  if (!isObject(parsed) || parsed.format !== 'gbf-tool-raid-parse' || parsed.version !== 1 || !isObject(parsed.raid)) {
    throw new Error('Unsupported GBF Tool raid parse file');
  }
  return sanitizeRaidParse(parsed.raid as unknown as NormalizedRaidParse);
}

function sanitizeRaidParse(value: NormalizedRaidParse | RaidHistoryRecord): NormalizedRaidParse {
  if (!value || value.schemaVersion !== 1 || typeof value.raidTechnicalId !== 'string' || !value.raidTechnicalId) {
    throw new Error('Invalid normalized raid parse');
  }
  return {
    schemaVersion: 1,
    raidTechnicalId: cleanString(value.raidTechnicalId)!,
    raidName: cleanString(value.raidName),
    role: value.role === 'host' || value.role === 'joined' ? value.role : undefined,
    observedStartedAt: finiteNumber(value.observedStartedAt),
    observedEndedAt: finiteNumber(value.observedEndedAt),
    durationMs: finiteNumber(value.durationMs),
    lastObservedTurn: finiteNumber(value.lastObservedTurn),
    result: ['active', 'victory', 'failure', 'left', 'unknown'].includes(value.result) ? value.result : 'unknown',
    resultQuality: quality(value.resultQuality),
    parserQuality: quality(value.parserQuality),
    damageQuality: quality(value.damageQuality),
    partyDamage: finiteNumber(value.partyDamage),
    characterDamage: Array.isArray(value.characterDamage) ? value.characterDamage.flatMap((entry) => {
      const actorId = cleanString(entry.actorId);
      if (!actorId) return [];
      return [{
        actorId,
        actorName: cleanString(entry.actorName),
        total: finiteNumber(entry.total) ?? 0,
        breakdown: sanitizeBreakdown(entry.breakdown),
        quality: quality(entry.quality),
      }];
    }) : [],
    boss: value.boss ? {
      id: cleanString(value.boss.id), name: cleanString(value.boss.name), hp: finiteNumber(value.boss.hp),
      maxHp: finiteNumber(value.boss.maxHp), hpPercent: finiteNumber(value.boss.hpPercent), quality: quality(value.boss.quality),
    } : undefined,
    participants: value.participants ? {
      count: finiteNumber(value.participants.count), honors: finiteNumber(value.participants.honors),
      contribution: finiteNumber(value.participants.contribution), quality: quality(value.participants.quality),
    } : undefined,
    stats: {
      attackActions: finiteNumber(value.stats?.attackActions), multiattacks: finiteNumber(value.stats?.multiattacks),
      criticalHits: finiteNumber(value.stats?.criticalHits), skillsUsed: finiteNumber(value.stats?.skillsUsed),
      ougisUsed: finiteNumber(value.stats?.ougisUsed), quality: quality(value.stats?.quality),
    },
    log: Array.isArray(value.log) ? value.log.map((entry) => ({
      observedAt: finiteNumber(entry.observedAt) ?? 0,
      turn: finiteNumber(entry.turn),
      actorId: cleanString(entry.actorId), actorName: cleanString(entry.actorName),
      actionKind: ['normal', 'skill', 'ougi', 'summon', 'other'].includes(entry.actionKind) ? entry.actionKind : 'other',
      actionName: cleanString(entry.actionName), damage: finiteNumber(entry.damage) ?? 0,
      breakdown: sanitizeBreakdown(entry.breakdown),
      targetIds: Array.isArray(entry.targetIds) ? entry.targetIds.map(cleanString).filter((entry): entry is string => Boolean(entry)) : undefined,
      criticalHits: finiteNumber(entry.criticalHits), multiattack: finiteNumber(entry.multiattack),
    })) : [],
    drops: Array.isArray(value.drops) ? value.drops.flatMap((drop) => {
      const itemId = cleanString(drop.itemId);
      const quantity = finiteNumber(drop.quantity);
      if (!itemId || quantity === undefined) return [];
      return [{ itemId, name: cleanString(drop.name), quantity, chest: cleanString(drop.chest) }];
    }) : [],
    dropsQuality: quality(value.dropsQuality),
    coverage: {
      startObserved: value.coverage?.startObserved === true,
      terminalObserved: value.coverage?.terminalObserved === true,
      parseGapObserved: value.coverage?.parseGapObserved === true,
    },
    lastObservedAt: finiteNumber(value.lastObservedAt) ?? 0,
  };
}

function sanitizeBreakdown(value: DamageBreakdown | undefined): DamageBreakdown {
  const result: DamageBreakdown = {};
  if (!value) return result;
  for (const key of ['normal', 'skill', 'ougi', 'echo', 'supplemental', 'other']) {
    const typedKey = key as keyof DamageBreakdown;
    const amount = finiteNumber(value[typedKey]);
    if (amount !== undefined) result[typedKey] = amount;
  }
  return result;
}
function cleanString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function finiteNumber(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function quality(value: unknown): 'known' | 'partial' | 'unknown' { return value === 'known' || value === 'partial' ? value : 'unknown'; }
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
