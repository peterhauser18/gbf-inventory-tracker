import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyVerifiedNormalDamage, criticalDecision } from './damage-semantics.ts';
import type { ParsedDamageHit } from './types.ts';

function hit(amount: number, concurrentAttackCount: number, extras: Partial<ParsedDamageHit> = {}): ParsedDamageHit {
  return { amount, kind: 'normal', concurrentAttackCount, ...extras };
}

test('deduplicates repeated crit flags to one source attack decision', () => {
  const hits = [
    hit(952598, 0, { critical: true, attackCount: 0, isRandomAttack: true }),
    hit(305048, 1, { critical: true, attackCount: 0, isRandomAttack: true }),
    hit(945707, 0, { critical: true, attackCount: 0, isRandomAttack: true }),
    hit(306298, 1, { critical: true, attackCount: 0, isRandomAttack: true }),
  ];
  assert.equal(criticalDecision(hits), true);
  assert.equal(criticalDecision(hits.map((entry) => ({ ...entry, critical: false }))), false);
});

test('keeps a conflicting crit payload unknown rather than inventing a decision', () => {
  assert.equal(criticalDecision([
    hit(100, 0, { critical: true }),
    hit(20, 1, { critical: false }),
  ]), undefined);
});

test('keeps a partially observed crit payload unknown rather than extrapolating', () => {
  assert.equal(criticalDecision([
    hit(100, 0, { critical: true }),
    hit(20, 1),
  ]), undefined);
});

test('classifies the observed flurry plus echo lane pattern conservatively', () => {
  const classified = classifyVerifiedNormalDamage([
    hit(588476, 0, { critical: false, attackCount: 0, isRandomAttack: true }),
    hit(211682, 1, { critical: false, attackCount: 0, isRandomAttack: true }),
    hit(588212, 0, { critical: false, attackCount: 0, isRandomAttack: true }),
    hit(211622, 1, { critical: false, attackCount: 0, isRandomAttack: true }),
  ]);
  assert.deepEqual(classified.map((entry) => entry.kind), ['normal', 'echo', 'normal', 'echo']);
  assert.equal(classified.reduce((sum, entry) => sum + entry.amount, 0), 1_599_992);
});

test('classifies a complete repeated concurrent lane grid as normal', () => {
  const classified = classifyVerifiedNormalDamage([
    hit(100, 0, { attackCount: 0 }),
    hit(40, 1, { attackCount: 0 }),
    hit(101, 0, { attackCount: 1 }),
    hit(41, 1, { attackCount: 1 }),
    hit(102, 0, { attackCount: 2 }),
    hit(42, 1, { attackCount: 2 }),
  ]);
  assert.deepEqual(classified.map((entry) => entry.kind), ['normal', 'normal', 'normal', 'normal', 'normal', 'normal']);
});

test('does not classify Flurry plus Echo when attack_count evidence is partial', () => {
  const classified = classifyVerifiedNormalDamage([
    hit(588476, 0, { critical: false, attackCount: 0, isRandomAttack: true }),
    hit(211682, 1, { critical: false, isRandomAttack: true }),
    hit(588212, 0, { critical: false, attackCount: 0, isRandomAttack: true }),
    hit(211622, 1, { critical: false, attackCount: 0, isRandomAttack: true }),
  ]);
  assert.deepEqual(classified.map((entry) => entry.kind), ['normal', 'other', 'normal', 'other']);
});

test('keeps an ambiguous concurrent pair unclassified while preserving total damage', () => {
  const classified = classifyVerifiedNormalDamage([
    hit(916989, 0, { critical: true, attackCount: 0 }),
    hit(920515, 1, { critical: true, attackCount: 0 }),
  ]);
  assert.deepEqual(classified.map((entry) => entry.kind), ['normal', 'other']);
  assert.equal(classified.reduce((sum, entry) => sum + entry.amount, 0), 1_837_504);
});
