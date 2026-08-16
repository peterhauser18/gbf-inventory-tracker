import type { CombatActorContext, CombatParseContext } from './multiraid.ts';
import type { NormalizedRaidParse } from './types.ts';

export interface MissingRosterActor {
  actor: CombatActorContext;
  originalIndex: number;
  state: 'dead' | 'active' | 'reserve' | 'observed';
}

export function liveDurationLabel(raid: NormalizedRaidParse, now: number): string {
  const terminalAt = raid.observedEndedAt;
  if (raid.durationMs !== undefined && terminalAt !== undefined) return formatDuration(raid.durationMs);

  const start = raid.observedStartedAt;
  const firstObservedAction = earliestObservedAction(raid);
  const baseline = start ?? firstObservedAction;
  if (baseline === undefined) return 'not observed';

  const end = terminalAt ?? now;
  const elapsed = Math.max(0, end - baseline);
  const formatted = formatDuration(elapsed);
  return start !== undefined ? formatted : `≥ ${formatted} observed`;
}

export function participantSummary(
  raid: NormalizedRaidParse,
  context: CombatParseContext | null | undefined,
): string {
  if (raid.participants?.count !== undefined) return `${formatNumber(raid.participants.count)} / 30`;
  const rows = context?.participants?.length ?? 0;
  return rows > 0 ? `${formatNumber(rows)}+ observed` : 'not observed';
}

export function missingRosterActors(
  context: CombatParseContext | null | undefined,
  representedActorIds: ReadonlySet<string>,
): MissingRosterActor[] {
  const history = (context?.actors ?? []).slice(0, 6);
  if (!history.length) return [];
  const activeIds = new Set(
    (context?.actorSlots ?? []).slice(0, 4).flatMap((actor) => actor.id ? [actor.id] : []),
  );

  return history.flatMap((actor, originalIndex) => {
    if (!actor.id || representedActorIds.has(actor.id)) return [];
    const state: MissingRosterActor['state'] = actor.alive === false
      ? 'dead'
      : activeIds.has(actor.id)
        ? 'active'
        : originalIndex >= 4
          ? 'reserve'
          : 'observed';
    return [{ actor, originalIndex, state }];
  });
}

export function combatInitials(label: string): string {
  return label.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

function earliestObservedAction(raid: NormalizedRaidParse): number | undefined {
  let earliest: number | undefined;
  for (const entry of raid.log) {
    if (!Number.isFinite(entry.observedAt) || entry.observedAt < 0) continue;
    earliest = earliest === undefined ? entry.observedAt : Math.min(earliest, entry.observedAt);
  }
  return earliest;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
