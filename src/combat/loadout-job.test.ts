import test from 'node:test';
import assert from 'node:assert/strict';
import type { CapturedResponseRecord } from '../capture/types.ts';
import { normalizeObservedDeckJob, withObservedJob } from './loadout-job.ts';
import type { RaidLoadoutSnapshot } from './loadout-types.ts';

function record(body: unknown): CapturedResponseRecord {
  return {
    id: 'scan:req',
    scanId: 'scan',
    meta: {
      requestId: 'req',
      url: 'https://game.granbluefantasy.jp/party/deck',
      resourceType: 'xhr',
      capturedAt: 20,
    },
    body,
    categories: [],
  };
}

function loadout(deckId = '151', updatedAt = 20): RaidLoadoutSnapshot {
  return {
    quality: 'known', observedAt: 10, updatedAt, correlation: 'signature', deckId,
    signature: { npcIds: [], summonIds: [] }, partyQuality: 'unknown', party: [],
    summonQuality: 'unknown', summons: [], weaponGridQuality: 'known', weapons: [],
    calculator: { quality: 'unknown', enhancement: {}, boosts: [] },
  };
}

test('party deck job is normalized without storing unrelated deck/account fields', () => {
  const observed = normalizeObservedDeckJob(record({ deck: { priority: 151, pc: { job: { master: { id: '140401', name: 'Bandit Tycoon' } } } } }));
  assert.deepEqual(observed, { deckId: '151', jobId: '140401', jobName: 'Bandit Tycoon', observedAt: 20 });
});

test('job enrichment only applies after strict loadout correlation established the same deck id', () => {
  const observed = { deckId: '151', jobId: '140401', jobName: 'Bandit Tycoon', observedAt: 20 };
  const matching = { raidTechnicalId: '305211', loadout: loadout('151') };
  const enriched = withObservedJob(matching, observed);
  assert.equal(enriched.loadout?.jobId, '140401');
  assert.equal(enriched.loadout?.jobName, 'Bandit Tycoon');
  assert.equal(enriched.loadout?.updatedAt, 20);
  const other = { raidTechnicalId: '305211', loadout: loadout('84') };
  assert.equal(withObservedJob(other, observed), other);
  const stale = { raidTechnicalId: '305211', loadout: loadout('151', 10) };
  assert.equal(withObservedJob(stale, observed), stale);
});
