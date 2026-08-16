import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_DIGEST_FAMILIES,
  buildAnalysisDigest,
  compareAnalysisDigests,
  parseAnalysisDigest,
  serializeAnalysisDigest,
} from './analysis-digest.ts';

function snapshot(overrides: Record<string, unknown> = {}): any {
  return {
    characters: [{ id: 'instance-secret-ish', masterId: '3040000000', updatedAt: 1 }],
    weapons: [{ id: 'weapon-instance', masterId: '1040000000', updatedAt: 1 }],
    summons: [], artifacts: [], weaponStashes: [],
    treasures: [{ itemId: '1', quantity: 99, updatedAt: 1 }],
    consumables: [], tickets: [], progression: [{ key: 'x', value: true, updatedAt: 1 }],
    accountStatus: { rank: 250, updatedAt: 1 },
    quality: {
      characters: 'known', weapons: 'partial', summons: 'unknown', artifacts: 'known', treasures: 'known',
      consumables: 'known', tickets: 'known', accountStatus: 'known', progression: 'partial',
    },
    capturedAt: 1000,
    ...overrides,
  };
}

test('exports only bounded summary fields and no raw account instance/item values', () => {
  const digest = buildAnalysisDigest(snapshot(), 2000);
  const json = serializeAnalysisDigest(digest);
  assert.deepEqual(Object.keys(digest).sort(), ['capturedAt', 'exportedAt', 'families', 'format', 'rank', 'version']);
  assert.deepEqual(Object.keys(digest.families), ANALYSIS_DIGEST_FAMILIES);
  assert.equal(digest.families.characters.count, 1);
  assert.equal(digest.families.treasures.count, 1);
  assert.equal(digest.families.summons.count, undefined);
  assert.equal(digest.rank.value, 250);
  assert.doesNotMatch(json, /instance-secret-ish|weapon-instance|3040000000|1040000000|"itemId"|"quantity"/);
  assert.doesNotMatch(json, /cookie|authorization|header|url|combat|note/i);
});

test('parses valid digest into a fresh allowlisted object', () => {
  const original = buildAnalysisDigest(snapshot(), 2000);
  const parsed = parseAnalysisDigest(serializeAnalysisDigest(original));
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed, original);
});

test('rejects unsupported versions and unexpected fields rather than retaining them', () => {
  const digest: any = buildAnalysisDigest(snapshot(), 2000);
  assert.throws(() => parseAnalysisDigest(JSON.stringify({ ...digest, version: 2 })), /version/);
  assert.throws(() => parseAnalysisDigest(JSON.stringify({ ...digest, cookie: 'do-not-retain' })), /Unexpected field/);
  digest.families.characters = { ...digest.families.characters, actorId: 'nope' };
  assert.throws(() => parseAnalysisDigest(JSON.stringify(digest)), /Unexpected field/);
});

test('comparison emits deltas only when both sides are known', () => {
  const previous = buildAnalysisDigest(snapshot(), 2000);
  const currentSnapshot = snapshot({
    characters: [{ id: '2', masterId: 'a', updatedAt: 2 }, { id: '3', masterId: 'b', updatedAt: 2 }],
    weapons: [{ id: 'w1', masterId: 'x', updatedAt: 2 }, { id: 'w2', masterId: 'y', updatedAt: 2 }],
    accountStatus: { rank: 251, updatedAt: 2 }, capturedAt: 3000,
  });
  const current = buildAnalysisDigest(currentSnapshot, 4000);
  const comparison = compareAnalysisDigests(previous, current);
  const characters = comparison.rows.find((row) => row.key === 'characters')!;
  const weapons = comparison.rows.find((row) => row.key === 'weapons')!;
  const summons = comparison.rows.find((row) => row.key === 'summons')!;
  const rank = comparison.rows.find((row) => row.key === 'rank')!;
  assert.deepEqual(characters, { key: 'characters', label: 'Characters', previous: 1, current: 2, delta: 1, quality: 'known' });
  assert.equal(weapons.delta, undefined);
  assert.equal(weapons.quality, 'partial');
  assert.equal(summons.delta, undefined);
  assert.equal(summons.quality, 'unknown');
  assert.equal(rank.delta, 1);
});

test('known rank requires a value while partial/unknown rank never becomes numeric comparison data', () => {
  const digest: any = buildAnalysisDigest(snapshot(), 2000);
  delete digest.rank.value;
  assert.throws(() => parseAnalysisDigest(JSON.stringify(digest)), /Known rank/);
  const partial = buildAnalysisDigest(snapshot({ quality: { ...snapshot().quality, accountStatus: 'partial' } }), 2000);
  assert.equal(partial.rank.value, undefined);
  const inconsistent = buildAnalysisDigest(snapshot({ accountStatus: undefined }), 2000);
  assert.equal(inconsistent.rank.quality, 'partial');
  assert.equal(inconsistent.rank.value, undefined);
});

test('unknown families omit numeric counts so raw exports do not imply zero', () => {
  const digest: any = buildAnalysisDigest(snapshot(), 2000);
  assert.equal(digest.families.summons.quality, 'unknown');
  assert.equal(digest.families.summons.count, undefined);
  const invalid = structuredClone(digest);
  invalid.families.summons.count = 0;
  assert.throws(() => parseAnalysisDigest(JSON.stringify(invalid)), /Unknown family summons/);
});
