import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { observedFinalizeRaid } from './lifecycle.ts';
import { mergeVerifiedMultiraidObservation, type VerifiedCombatObservation } from './multiraid.ts';
import type { NormalizedRaidParse } from './types.ts';

function completedCombat(): NormalizedRaidParse {
  return observedFinalizeRaid({
    schemaVersion: 1,
    raidTechnicalId: '305731',
    instanceId: 'instance-a',
    result: 'victory',
    resultQuality: 'known',
    parserQuality: 'known',
    damageQuality: 'known',
    partyDamage: 156_181_719,
    characterDamage: [{
      actorId: 'actor-a',
      actorName: 'Caspr',
      total: 156_181_719,
      breakdown: { normal: 100_000_000, skill: 56_181_719 },
      quality: 'known',
    }],
    stats: { attackActions: 8, skillsUsed: 4, quality: 'known' },
    log: [{
      observedAt: 9_000,
      turn: 8,
      actorId: 'actor-a',
      actorName: 'Caspr',
      actionKind: 'normal',
      damage: 156_181_719,
      breakdown: { normal: 156_181_719 },
    }],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: true, terminalObserved: true, parseGapObserved: false },
    observedStartedAt: 1_000,
    observedEndedAt: 10_000,
    lastObservedAt: 10_000,
  });
}

test('delayed result rewards merge onto finalized combat accounting instead of replacing it', () => {
  const current = completedCombat();
  const reward: VerifiedCombatObservation = {
    raidTechnicalId: '305731',
    observedAt: 11_000,
    observedTurn: 8,
    startObserved: false,
    actions: [],
    actionsFieldPresent: false,
    unparsedActionCount: 0,
    drops: [{ itemId: '10:629', name: 'Narophirmidas Fellcore', quantity: 1, chest: '3' }],
    dropsQuality: 'known',
    context: { raidTechnicalId: '305731', instanceId: 'instance-a', actorSlots: [] },
  };

  const merged = mergeVerifiedMultiraidObservation(current, reward);
  assert.equal(merged.partyDamage, 156_181_719);
  assert.equal(merged.characterDamage.length, 1);
  assert.equal(merged.characterDamage[0]?.total, 156_181_719);
  assert.equal(merged.log.length, 1);
  assert.equal(merged.dropsQuality, 'known');
  assert.deepEqual(merged.drops, reward.drops);
});

test('storage resumes captured history only when the active row is gone and identity is proven', () => {
  const source = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /const capturedCurrent = !activeCurrent && \(observation\.context\?\.instanceId \|\| state\.manualFinalizedKeys\[key\]\)/,
  );
  assert.match(source, /const current = activeCurrent \?\? capturedCurrent \?\? null/);
  assert.match(source, /getCapturedHistoryForIdentity\(observation\.context\?\.instanceId, observation\.raidTechnicalId\)/);
});
