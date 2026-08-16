import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRaidParseExport } from './export.ts';
import { emptyRaidParse } from './parser.ts';

test('raid export preserves only normalized safe hit diagnostics', () => {
  const raid = emptyRaidParse('raid-test', 10);
  raid.log = [{
    observedAt: 11,
    turn: 1,
    actorId: 'actor-test',
    actionKind: 'normal',
    damage: 123,
    breakdown: { normal: 100, other: 23 },
    critical: true,
    criticalHits: 1,
    multiattack: 1,
    damageInstances: [{
      amount: 123,
      kind: 'other',
      targetId: 'boss-test',
      critical: true,
      attackCount: 1,
      concurrentAttackCount: 1,
      isRandomAttack: false,
    }],
  }];

  const exported = buildRaidParseExport(raid).raid.log[0];
  assert.equal(exported?.critical, true);
  assert.deepEqual(exported?.damageInstances, [{
    amount: 123,
    kind: 'other',
    targetId: 'boss-test',
    critical: true,
    attackCount: 1,
    concurrentAttackCount: 1,
    isRandomAttack: false,
  }]);
  assert.equal(JSON.stringify(exported).includes('cookie'), false);
  assert.equal(JSON.stringify(exported).includes('authorization'), false);
});
