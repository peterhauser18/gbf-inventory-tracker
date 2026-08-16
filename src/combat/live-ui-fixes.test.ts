import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CombatParseContext } from './multiraid.ts';
import type { NormalizedRaidParse } from './types.ts';
import { liveDurationLabel, missingRosterActors, participantSummary } from './live-ui-state.ts';

function raid(patch: Partial<NormalizedRaidParse> = {}): NormalizedRaidParse {
  return {
    schemaVersion: 1,
    raidTechnicalId: 'raid-a',
    result: 'active',
    resultQuality: 'unknown',
    parserQuality: 'partial',
    damageQuality: 'partial',
    characterDamage: [],
    stats: { quality: 'partial' },
    log: [],
    drops: [],
    dropsQuality: 'unknown',
    coverage: { startObserved: false, terminalObserved: false, parseGapObserved: false },
    lastObservedAt: 1_000,
    ...patch,
  };
}

test('live duration advances from a verified start and freezes at terminal duration', () => {
  const active = raid({ observedStartedAt: 1_000, lastObservedAt: 2_000 });
  assert.equal(liveDurationLabel(active, 66_000), '1:05');

  const terminal = raid({
    result: 'victory',
    observedStartedAt: 1_000,
    observedEndedAt: 61_000,
    durationMs: 60_000,
  });
  assert.equal(liveDurationLabel(terminal, 999_000), '1:00');
});

test('late observation duration is explicitly partial instead of pretending to be full fight time', () => {
  const late = raid({
    log: [{ observedAt: 10_000, actionKind: 'normal', damage: 1, breakdown: { normal: 1 } }],
  });
  assert.equal(liveDurationLabel(late, 75_000), '≥ 1:05 observed');
  assert.equal(liveDurationLabel(raid(), 75_000), 'not observed');
});

test('participant summary uses proven count or rows and never fabricates zero', () => {
  const context: CombatParseContext = {
    raidTechnicalId: 'raid-a',
    actorSlots: [],
    participants: [{ name: 'A' }, { name: 'B' }],
  };
  assert.equal(participantSummary(raid({ participants: { count: 17, quality: 'known' } }), context), '17 / 30');
  assert.equal(participantSummary(raid(), context), '2+ observed');
  assert.equal(participantSummary(raid(), null), 'not observed');
});

test('missing roster history retains dead frontliners after two backline promotions', () => {
  const context: CombatParseContext = {
    raidTechnicalId: 'raid-a',
    actorSlots: [
      { id: 'back-b', name: 'Back B', alive: true },
      { id: 'back-a', name: 'Back A', alive: true },
      { id: 'front-c', name: 'Front C', alive: true },
      { id: 'front-d', name: 'Front D', alive: true },
    ],
    actors: [
      { id: 'front-a', name: 'Front A', hp: 0, alive: false },
      { id: 'front-b', name: 'Front B', hp: 0, alive: false },
      { id: 'front-c', name: 'Front C', alive: true },
      { id: 'front-d', name: 'Front D', alive: true },
      { id: 'back-a', name: 'Back A', alive: true },
      { id: 'back-b', name: 'Back B', alive: true },
    ],
  };
  const represented = new Set(['back-b', 'back-a', 'front-c', 'front-d']);
  assert.deepEqual(missingRosterActors(context, represented).map((entry) => [entry.actor.id, entry.originalIndex, entry.state]), [
    ['front-a', 0, 'dead'],
    ['front-b', 1, 'dead'],
  ]);
});

test('live UI fix remains local/read-only and caps the rendered summon surface at six', () => {
  const source = readFileSync(new URL('./live-ui-fixes.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./live-ui-fixes.css', import.meta.url), 'utf8');
  assert.match(source, /getCombatLiveContext/);
  assert.match(source, /getLatestCombatParse/);
  assert.match(source, /cards\.slice\(6\)/);
  assert.match(source, /supporter-slot/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest/);
  assert.doesNotMatch(source, /chrome\.debugger/);
  assert.match(styles, /repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(styles, /aspect-ratio: 1 \/ 1/);
  assert.match(styles, /object-fit: contain/);
});
