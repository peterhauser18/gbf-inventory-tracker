import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearLiveBattleFeedParticipantSnapshot,
  liveBattleFeedInstanceId,
  liveBattleFeedRecord,
  liveParticipantSnapshotRecord,
  rememberLiveParticipantIdentities,
} from './live-feed.ts';

test('live feed socket identity is accepted only from an explicit raid room', () => {
  assert.equal(
    liveBattleFeedInstanceId('ws://203.0.113.5:11230/socket.io/?room=raid46421463095&EIO=3&transport=websocket'),
    '46421463095',
  );
  assert.equal(liveBattleFeedInstanceId('ws://203.0.113.5/socket.io/?room=lobby'), undefined);
  assert.equal(liveBattleFeedInstanceId('not-a-url'), undefined);
});

test('start participant snapshots build the existing members route and omit ambiguous living hp_ratio zero', () => {
  clearLiveBattleFeedParticipantSnapshot();
  const snapshot = liveParticipantSnapshotRecord(JSON.stringify({
    raid_id: '46421463095',
    multi_raid_member_info: [
      { user_id: '100', nickname: 'Host', level: '395', is_host: true, is_dead: false, retired_flag: false, hp_ratio: 0 },
      { user_id: '200', nickname: 'Dead', level: '350', is_host: false, is_dead: true, retired_flag: false, hp_ratio: 0 },
    ],
    mvp_info: [{ user_id: '100', rank: 1, point: '12345' }],
  }), 'start-1', 10);

  assert.ok(snapshot);
  assert.equal(snapshot.instanceId, '46421463095');
  const body = snapshot.record.body as {
    multi_member_info: Array<Record<string, unknown>>;
    mvp_info: Array<Record<string, unknown>>;
  };
  assert.equal(body.multi_member_info.length, 2);
  assert.equal('hp_ratio' in body.multi_member_info[0]!, false);
  assert.equal(body.multi_member_info[1]?.hp_ratio, 0);
  assert.deepEqual(body.mvp_info, [{ user_id: '100', nickname: 'Host', rank: 1, point: 12345 }]);
});

test('bossUpdate and battleFinish become passive synthetic boss snapshots only', () => {
  const boss = liveBattleFeedRecord(
    '46421463095',
    'ws-1',
    '42["raid",{"bossUpdate":{"param":{"boss1_hp":1280123376}}}]',
    20,
  );
  assert.ok(boss);
  assert.equal(boss.identityChanged, false);
  assert.match(boss.record.meta.url, /ability_result\.json$/);
  assert.deepEqual(boss.record.body, { scenario: [{ cmd: 'boss_gauge', pos: 0, hp: 1280123376 }] });

  const finish = liveBattleFeedRecord(
    '46421463095',
    'ws-1',
    '42["raid",{"battleFinish":{"timestamp":"1","user_id":"100"}}]',
    21,
  );
  assert.deepEqual(finish?.record.body, { scenario: [{ cmd: 'boss_gauge', pos: 0, hp: 0 }] });
});

test('mvpUpdate uses explicit point values for known participants and never infers honors from damage-only frames', () => {
  clearLiveBattleFeedParticipantSnapshot();
  rememberLiveParticipantIdentities('46421463095', {
    '100': { nickname: 'Host', level: 395, status: 'active' },
    '200': { nickname: 'Guest', level: 375, status: 'active' },
  });

  const mvp = liveBattleFeedRecord(
    '46421463095',
    'ws-2',
    '42["raid",{"mvpUpdate":{"mvpList":[{"user_id":"200","rank":1,"point":"98765"},{"user_id":"100","rank":2,"point":"54321"}]}}]',
    30,
  );
  assert.ok(mvp);
  assert.match(mvp.record.meta.url, /multi_member_info$/);
  assert.deepEqual((mvp.record.body as { mvp_info: unknown[] }).mvp_info, [
    { user_id: '200', nickname: 'Guest', rank: 1, point: 98765 },
    { user_id: '100', nickname: 'Host', rank: 2, point: 54321 },
  ]);

  assert.equal(
    liveBattleFeedRecord('46421463095', 'ws-2', '42["raid",{"damage":{"user_id":"200","value":999999}}]', 31),
    null,
  );
});

test('memberJoin extends the known participant set and carries exact ranking updates', () => {
  clearLiveBattleFeedParticipantSnapshot();
  rememberLiveParticipantIdentities('46421463095', {
    '100': { nickname: 'Host', level: 395, status: 'active' },
  });

  const joined = liveBattleFeedRecord(
    '46421463095',
    'ws-3',
    '42["raid",{"memberJoin":{"member":{"user_id":"300","nickname":"Joiner","level":360,"job_id":101,"pc_attribute":2,"group_num":null},"mvpList":[{"user_id":"100","rank":1,"point":"1200"},{"user_id":"300","rank":2,"point":"300"}]}}]',
    40,
  );
  assert.ok(joined);
  assert.equal(joined.identityChanged, true);
  const body = joined.record.body as { multi_member_info: Array<{ nickname: string }>, mvp_info: unknown[] };
  assert.deepEqual(body.multi_member_info.map((member) => member.nickname), ['Host', 'Joiner']);
  assert.deepEqual(body.mvp_info, [
    { user_id: '100', nickname: 'Host', rank: 1, point: 1200 },
    { user_id: '300', nickname: 'Joiner', rank: 2, point: 300 },
  ]);
});

test('later mvpUpdate snapshots replace stale exact ranking values', () => {
  clearLiveBattleFeedParticipantSnapshot();
  rememberLiveParticipantIdentities('46421463095', {
    '100': { nickname: 'Host', status: 'active' },
    '200': { nickname: 'Guest', status: 'active' },
  });
  assert.ok(liveBattleFeedRecord(
    '46421463095',
    'ws-4',
    '42["raid",{"mvpUpdate":{"mvpList":[{"user_id":"100","rank":1,"point":"1000"},{"user_id":"200","rank":2,"point":"500"}]}}]',
    50,
  ));

  const next = liveBattleFeedRecord(
    '46421463095',
    'ws-4',
    '42["raid",{"mvpUpdate":{"mvpList":[{"user_id":"200","rank":1,"point":"900"}]}}]',
    51,
  );
  assert.ok(next);
  assert.deepEqual((next.record.body as { mvp_info: unknown[] }).mvp_info, [
    { user_id: '200', nickname: 'Guest', rank: 1, point: 900 },
  ]);
});

test('non-Socket.IO, malformed and unknown live frames stay ignored', () => {
  assert.equal(liveBattleFeedRecord('1', 'ws', '{}', 1), null);
  assert.equal(liveBattleFeedRecord('1', 'ws', '42not-json', 1), null);
  assert.equal(liveBattleFeedRecord('1', 'ws', '42["raid",{"chatAdd":{"content":"x"}}]', 1), null);
});
