import type { CapturedResponseRecord } from '../capture/types.ts';

type Obj = Record<string, unknown>;

export type LiveParticipantIdentity = {
  nickname: string;
  level?: number;
  host?: boolean;
  status?: 'active' | 'dead' | 'retired';
  hpPercent?: number;
  placement?: number;
  honors?: number;
};

export interface LiveBattleFeedSocket {
  requestId: string;
  instanceId: string;
  tabId: number;
}

export interface LiveBattleFeedFrameResult {
  record: CapturedResponseRecord;
  identityChanged: boolean;
}

export interface LiveParticipantSnapshot {
  instanceId: string;
  participants: Record<string, LiveParticipantIdentity>;
  record: CapturedResponseRecord;
}

const participantIdentityByRaid = new Map<string, Map<string, LiveParticipantIdentity>>();
const MAX_IDENTITY_RAIDS = 8;

export function liveBattleFeedInstanceId(url: string): string | undefined {
  try {
    const room = new URL(url).searchParams.get('room')?.trim();
    const match = room ? /^raid(\d+)$/.exec(room) : null;
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function liveParticipantSnapshotRecord(
  rawBody: string,
  requestId: string,
  observedAt: number,
): LiveParticipantSnapshot | null {
  let body: Obj;
  try {
    const parsed = JSON.parse(rawBody);
    if (!obj(parsed)) return null;
    body = parsed;
  } catch {
    return null;
  }

  const instanceId = str(body.raid_id);
  const members = participantMembers(body);
  if (!instanceId || !members.length) return null;

  const participants: Record<string, LiveParticipantIdentity> = {};
  for (const member of members) {
    const userId = str(member.user_id);
    const nickname = str(member.nickname, member.name);
    if (!userId || !nickname) continue;
    participants[userId] = participantIdentity(member, nickname);
  }
  if (!Object.keys(participants).length) return null;

  applyRankingToIdentities(
    participants,
    Array.isArray(body.mvp_info) ? body.mvp_info.filter(obj) : [],
    false,
  );
  rememberLiveParticipantIdentities(instanceId, participants);
  return {
    instanceId,
    participants,
    record: participantRecord(
      requestId,
      observedAt,
      membersFromIdentities(participants),
      rankingFromIdentities(participants),
    ),
  };
}

export function liveBattleFeedRecord(
  instanceId: string,
  requestId: string,
  payloadData: string,
  observedAt: number,
): LiveBattleFeedFrameResult | null {
  const payload = socketIoPayload(payloadData);
  if (!payload) return null;

  const bossUpdate = obj(payload.bossUpdate) && obj(payload.bossUpdate.param)
    ? payload.bossUpdate.param
    : undefined;
  const battleFinish = obj(payload.battleFinish) ? payload.battleFinish : undefined;

  if (bossUpdate || battleFinish) {
    const hp = battleFinish ? 0 : num(bossUpdate?.boss1_hp);
    if (hp === undefined) return null;
    return {
      identityChanged: false,
      record: syntheticRecord(
        requestId,
        observedAt,
        'ability_result.json',
        { scenario: [{ cmd: 'boss_gauge', pos: 0, hp }] },
      ),
    };
  }

  const memberJoin = obj(payload.memberJoin) ? payload.memberJoin : undefined;
  const mvpUpdate = obj(payload.mvpUpdate) ? payload.mvpUpdate : undefined;
  const joinedMember = memberJoin && obj(memberJoin.member) ? memberJoin.member : undefined;
  const mvpList = memberJoin && Array.isArray(memberJoin.mvpList)
    ? memberJoin.mvpList.filter(obj)
    : mvpUpdate && Array.isArray(mvpUpdate.mvpList)
      ? mvpUpdate.mvpList.filter(obj)
      : [];

  if (!joinedMember && !mvpList.length) return null;

  const current = new Map(participantIdentityByRaid.get(instanceId) ?? []);
  let identityChanged = false;
  if (joinedMember) {
    const userId = str(joinedMember.user_id);
    const nickname = str(joinedMember.nickname, joinedMember.name);
    if (userId && nickname) {
      current.set(userId, participantIdentity(joinedMember, nickname, 'active'));
      identityChanged = true;
    }
  }
  if (!current.size) return null;

  const participants = Object.fromEntries(current);
  applyRankingToIdentities(participants, mvpList, true);
  participantIdentityByRaid.set(instanceId, new Map(Object.entries(participants)));
  trimIdentityRaids();
  return {
    identityChanged,
    record: participantRecord(
      requestId,
      observedAt,
      membersFromIdentities(participants),
      rankingFromIdentities(participants),
    ),
  };
}

export function rememberLiveParticipantIdentities(
  instanceId: string,
  participants: Record<string, LiveParticipantIdentity>,
): void {
  const current = new Map(participantIdentityByRaid.get(instanceId) ?? []);
  for (const [userId, participant] of Object.entries(participants)) {
    if (userId && participant.nickname) current.set(userId, { ...participant });
  }
  participantIdentityByRaid.set(instanceId, current);
  trimIdentityRaids();
}

export function liveParticipantIdentities(instanceId: string): Record<string, LiveParticipantIdentity> {
  return Object.fromEntries(
    [...(participantIdentityByRaid.get(instanceId) ?? new Map()).entries()]
      .map(([userId, participant]) => [userId, { ...participant }]),
  );
}

export function clearLiveBattleFeedParticipantSnapshot(instanceId?: string): void {
  if (instanceId) participantIdentityByRaid.delete(instanceId);
  else participantIdentityByRaid.clear();
}

function participantRecord(
  requestId: string,
  observedAt: number,
  members: Obj[],
  ranking: Obj[],
): CapturedResponseRecord {
  return syntheticRecord(
    requestId,
    observedAt,
    'multi_member_info',
    { multi_member_info: members, mvp_info: ranking },
  );
}

function syntheticRecord(
  requestId: string,
  observedAt: number,
  path: 'ability_result.json' | 'multi_member_info',
  body: unknown,
): CapturedResponseRecord {
  return {
    id: `live-feed:${requestId}:${observedAt}`,
    scanId: 'live-feed',
    meta: {
      requestId: `live-feed:${requestId}`,
      url: `https://game.granbluefantasy.jp/rest/multiraid/${path}`,
      resourceType: 'xhr',
      capturedAt: observedAt,
    },
    body,
    categories: [],
  };
}

function socketIoPayload(payloadData: string): Obj | undefined {
  if (!payloadData.startsWith('42')) return undefined;
  try {
    const decoded = JSON.parse(payloadData.slice(2));
    if (!Array.isArray(decoded) || decoded.length < 2 || !obj(decoded[1])) return undefined;
    return decoded[1];
  } catch {
    return undefined;
  }
}

function participantMembers(body: Obj): Obj[] {
  if (Array.isArray(body.multi_raid_member_info)) return body.multi_raid_member_info.filter(obj);
  if (Array.isArray(body.multi_member_info)) return body.multi_member_info.filter(obj);
  return [];
}

function participantIdentity(
  member: Obj,
  nickname: string,
  fallbackStatus?: LiveParticipantIdentity['status'],
): LiveParticipantIdentity {
  const retired = bool(member.retired_flag, member.retired);
  const dead = bool(member.is_dead, member.dead);
  const status = retired === true ? 'retired' as const
    : dead === true ? 'dead' as const
      : retired === false || dead === false ? 'active' as const
        : fallbackStatus;
  const rawHpPercent = num(member.hp_ratio);
  const includeHpPercent = rawHpPercent !== undefined && !(rawHpPercent === 0 && status === 'active');
  return {
    nickname,
    level: num(member.level),
    host: bool(member.is_host),
    status,
    ...(includeHpPercent ? { hpPercent: rawHpPercent } : {}),
  };
}

function membersFromIdentities(participants: Record<string, LiveParticipantIdentity>): Obj[] {
  return Object.entries(participants).map(([userId, participant]) => {
    const status = participant.status === 'dead'
      ? { is_dead: true, retired_flag: false }
      : participant.status === 'retired'
        ? { is_dead: false, retired_flag: true }
        : participant.status === 'active'
          ? { is_dead: false, retired_flag: false }
          : {};
    return {
      user_id: userId,
      nickname: participant.nickname,
      level: participant.level,
      is_host: participant.host,
      ...status,
      ...(Object.prototype.hasOwnProperty.call(participant, 'hpPercent')
        ? { hp_ratio: participant.hpPercent }
        : {}),
    };
  });
}

function applyRankingToIdentities(
  participants: Record<string, LiveParticipantIdentity>,
  ranking: Obj[],
  replacePrevious: boolean,
): void {
  if (replacePrevious) {
    for (const [userId, participant] of Object.entries(participants)) {
      const { placement: _placement, honors: _honors, ...rest } = participant;
      participants[userId] = rest;
    }
  }
  for (const entry of ranking) {
    const userId = str(entry.user_id);
    if (!userId) continue;
    const participant = participants[userId];
    if (!participant) continue;
    const placement = num(entry.rank);
    const honors = num(entry.point, entry.honors, entry.honour);
    participants[userId] = {
      ...participant,
      ...(placement !== undefined ? { placement } : {}),
      ...(honors !== undefined ? { honors } : {}),
    };
  }
}

function rankingFromIdentities(
  participants: Record<string, LiveParticipantIdentity>,
): Obj[] {
  return Object.entries(participants)
    .flatMap(([userId, participant]) => {
      if (participant.placement === undefined && participant.honors === undefined) return [];
      return [{
        user_id: userId,
        nickname: participant.nickname,
        rank: participant.placement,
        point: participant.honors,
      }];
    })
    .sort((a, b) => (num(a.rank) ?? Number.MAX_SAFE_INTEGER) - (num(b.rank) ?? Number.MAX_SAFE_INTEGER));
}

function trimIdentityRaids(): void {
  while (participantIdentityByRaid.size > MAX_IDENTITY_RAIDS) {
    const oldest = participantIdentityByRaid.keys().next().value as string | undefined;
    if (!oldest) break;
    participantIdentityByRaid.delete(oldest);
  }
}

function obj(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function num(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return undefined;
}

function bool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
  }
  return undefined;
}
