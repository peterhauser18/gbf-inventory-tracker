import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionTrackerExport,
  decodeCollectionTrackerCharacters,
  loadWikiCharacterMasterIds,
} from './collection-tracker.ts';

function character(masterId: string, uncap?: number) {
  return { masterId, uncap };
}

test('encodes an empty collection in the current seven-part tracker format', () => {
  const result = buildCollectionTrackerExport([]);
  assert.equal(result.hash, '......');
  assert.equal(result.url, 'https://gbf.wiki/Collection_Tracker#......');
  assert.deepEqual(result.includedMasterIds, []);
  assert.deepEqual(result.omitted, []);
});

test('round-trips SSR, SR and R characters with proven uncap state', () => {
  const result = buildCollectionTrackerExport([
    character('3040648000', 4),
    character('3030123000', 2),
    character('3020007000', 0),
  ]);
  assert.deepEqual(decodeCollectionTrackerCharacters(result.hash), [
    { rarity: 4, index: 648, uncap: 4 },
    { rarity: 3, index: 123, uncap: 2 },
    { rarity: 2, index: 7, uncap: 0 },
  ]);
});

test('matches the wiki short-id rule that ignores master ID position four', () => {
  const result = buildCollectionTrackerExport([character('3041648000', 4)]);
  assert.deepEqual(decodeCollectionTrackerCharacters(result.hash), [
    { rarity: 4, index: 648, uncap: 4 },
  ]);
});

test('omits unknown, unsupported and wiki-unresolved entries instead of guessing', () => {
  const known = new Set(['3040648000', '3030123000']);
  const result = buildCollectionTrackerExport([
    character('3040648000', 5),
    character('3030123000'),
    character('3020007000', 0),
    character('3050001000', 4),
    character('secret-token', 4),
  ], known);

  assert.deepEqual(result.includedMasterIds, ['3040648000']);
  assert.deepEqual(result.omitted, [
    { masterId: '3030123000', reason: 'unknown-uncap' },
    { masterId: '3020007000', reason: 'not-in-wiki-dataset' },
    { masterId: '3050001000', reason: 'unsupported-master-id' },
    { masterId: 'secret-token', reason: 'unsupported-master-id' },
  ]);
  assert.equal(result.url.includes('secret-token'), false);
});

test('deduplicates repeated master IDs', () => {
  const result = buildCollectionTrackerExport([
    character('3040648000', 4),
    character('3040648000', 4),
  ]);
  assert.deepEqual(result.includedMasterIds, ['3040648000']);
  assert.equal(decodeCollectionTrackerCharacters(result.hash).length, 1);
});

test('loads the public wiki character dataset unfiltered with omitted credentials', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const ids = await loadWikiCharacterMasterIds(async (input, init) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ cargoquery: [{ title: { id: '3040648000' } }] }),
    };
  });

  assert.deepEqual([...ids], ['3040648000']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url.origin, 'https://gbf.wiki');
  assert.equal(calls[0]?.url.searchParams.get('tables'), 'characters');
  assert.equal(calls[0]?.url.searchParams.get('fields'), 'id');
  assert.equal(calls[0]?.url.search.includes('3040648000'), false);
  assert.equal(calls[0]?.init?.credentials, 'omit');
  assert.equal(calls[0]?.init?.referrerPolicy, 'no-referrer');
});

test('accepts the wiki backward-compatible semicolon separator when decoding', () => {
  const result = buildCollectionTrackerExport([character('3040648000', 4)]);
  const legacy = result.hash.replaceAll('.', ';');
  assert.deepEqual(decodeCollectionTrackerCharacters(legacy), [
    { rarity: 4, index: 648, uncap: 4 },
  ]);
});

test('generated tracker URLs cannot include instance or scan identifiers from extra input fields', () => {
  const input = [{ masterId: '3040648000', uncap: 4, id: 'instance-123', scanId: 'scan-secret' }];
  const result = buildCollectionTrackerExport(input);
  assert.equal(result.url.includes('instance-123'), false);
  assert.equal(result.url.includes('scan-secret'), false);
});
