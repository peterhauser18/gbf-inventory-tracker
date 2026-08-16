import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRosterCapabilityRows,
  detectRosterCapabilities,
  filterRosterCapabilityRows,
  loadWikiRosterCatalog,
  type WikiRosterCatalog,
} from './roster-capabilities.ts';

function catalog(overrides: Partial<WikiRosterCatalog> = {}): WikiRosterCatalog {
  return {
    characters: new Map([['3040000000', {
      masterId: '3040000000', name: 'Fixture Hero', wikiTitle: 'Fixture Hero', element: 'fire', style: 'balanced', races: ['Human'], weapons: ['Sabre'],
    }]]),
    capabilitiesById: new Map([['3040000000', new Set(['dispel', 'veil'])]]),
    capabilitiesByTitle: new Map(),
    baseQuality: 'known', capabilityQuality: 'known',
    sourceQuality: { skills: 'known', passives: 'known', ougi: 'known' },
    ...overrides,
  };
}

test('detects objective utility phrases without treating Dispel Cancel as Dispel', () => {
  assert.deepEqual([...detectRosterCapabilities('Remove 1 buff. All allies gain Veil.')].sort(), ['dispel', 'veil']);
  assert.equal(detectRosterCapabilities("All allies gain Dispel Cancel. Buffs can't be removed.").has('dispel'), false);
  assert.equal(detectRosterCapabilities("Inflict Gravity. Reduce a foe's filled charge diamonds by 1.").has('gravity'), true);
  assert.equal(detectRosterCapabilities('Immune to Gravity and Delay.').has('gravity'), false);
  assert.equal(detectRosterCapabilities('Immune to Gravity and Delay.').has('delay'), false);
  assert.equal(detectRosterCapabilities("Inflict Gravity. Reduce a foe's filled charge diamonds by 1.").has('delay'), true);
  assert.equal(detectRosterCapabilities("Restore all allies' HP. Remove 1 debuff.").has('heal'), true);
  assert.equal(detectRosterCapabilities("Restore all allies' HP. Remove 1 debuff.").has('clear'), true);
  assert.equal(detectRosterCapabilities('Gain Substitute and Shield effect. 70% Water Damage Cut.').has('substitute'), true);
  assert.equal(detectRosterCapabilities('Gain Substitute and Shield effect. 70% Water Damage Cut.').has('shield'), true);
  assert.equal(detectRosterCapabilities('Gain Substitute and Shield effect. 70% Water Damage Cut.').has('damage-cut'), true);
  assert.equal(detectRosterCapabilities('Veil effects are extended by 1 turn.').has('veil'), false);
  assert.equal(detectRosterCapabilities('Boost to DEF while Shield effect is active.').has('shield'), false);
  assert.equal(detectRosterCapabilities('Boost to ATK while Substitute is active.').has('substitute'), false);
  assert.equal(detectRosterCapabilities('Damage Cut effects are reduced.').has('damage-cut'), false);
});

test('loads only bulk public Cargo tables without owned-character filters or credentials', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    const table = url.searchParams.get('tables');
    const title = table === 'characters'
      ? { id: '3040000000', page: 'Fixture Hero', element: 'fire', type: 'balanced', race: 'Human', weapon: 'Sabre' }
      : table === 'character_skills'
        ? { character_id: '3040000000', page: 'Fixture Hero', description: 'Remove 1 buff.' }
        : { page: 'Fixture Hero', description: table === 'character_passives' ? 'Gain Shield effect.' : 'Restore all allies HP.' };
    return { ok: true, status: 200, json: async () => ({ cargoquery: [{ title }] }) };
  };

  const result = await loadWikiRosterCatalog(fetcher);
  assert.equal(result.characters.get('3040000000')?.element, 'fire');
  assert.equal(result.capabilitiesById.get('3040000000')?.has('dispel'), true);
  assert.equal(result.capabilitiesByTitle.get('fixture hero')?.has('shield'), true);
  assert.equal(result.capabilityQuality, 'known');
  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://gbf.wiki');
    assert.equal(call.url.pathname, '/api.php');
    assert.equal(call.url.searchParams.has('where'), false);
    assert.equal(call.url.searchParams.has('ids'), false);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }
});


test('malformed Cargo responses downgrade capability coverage instead of becoming a false known absence', async () => {
  const fetcher = async (input: string | URL) => {
    const table = new URL(input.toString()).searchParams.get('tables');
    if (table === 'character_passives') return { ok: true, status: 200, json: async () => ({ error: { code: 'cargoquery-invalidfield' } }) };
    const title = table === 'characters'
      ? { id: '3040000000', page: 'Fixture Hero' }
      : table === 'character_skills'
        ? { character_id: '3040000000', page: 'Fixture Hero', description: 'Remove 1 buff.' }
        : { page: 'Fixture Hero', description: 'No matching utility here.' };
    return { ok: true, status: 200, json: async () => ({ cargoquery: [{ title }] }) };
  };
  const result = await loadWikiRosterCatalog(fetcher);
  assert.equal(result.sourceQuality.passives, 'unknown');
  assert.equal(result.capabilityQuality, 'partial');
  const rows = buildRosterCapabilityRows({ characters: [{ id: '1', masterId: '3040000000', updatedAt: 1 }], quality: { characters: 'known' } as any }, result);
  assert.equal(rows[0]?.capabilities.dispel, true);
  assert.equal(rows[0]?.capabilities.delay, undefined);
});

test('keeps absent capabilities unknown when Wiki capability coverage is partial', () => {
  const partial = catalog({
    capabilityQuality: 'partial',
    sourceQuality: { skills: 'known', passives: 'unknown', ougi: 'known' },
    capabilitiesById: new Map([['3040000000', new Set(['dispel'])]]),
  });
  const rows = buildRosterCapabilityRows({
    characters: [{ id: '1', masterId: '3040000000', updatedAt: 1 }],
    quality: { characters: 'partial' } as any,
  }, partial);
  assert.equal(rows[0]?.capabilities.dispel, true);
  assert.equal(rows[0]?.capabilities.veil, undefined);
  assert.equal(rows[0]?.metadataQuality, 'partial');
  assert.equal(rows[0]?.rosterQuality, 'partial');
});

test('filters observed roster deterministically by text, element and capability', () => {
  const rows = buildRosterCapabilityRows({
    characters: [
      { id: '1', masterId: '3040000000', element: 'fire', updatedAt: 1 },
      { id: '2', masterId: '3040000001', name: 'Other Hero', element: 'water', updatedAt: 1 },
    ],
    quality: { characters: 'known' } as any,
  }, catalog());
  assert.deepEqual(filterRosterCapabilityRows(rows, { query: 'fixture' }).map((row) => row.masterId), ['3040000000']);
  assert.deepEqual(filterRosterCapabilityRows(rows, { element: 'fire' }).map((row) => row.masterId), ['3040000000']);
  assert.deepEqual(filterRosterCapabilityRows(rows, { capability: 'dispel' }).map((row) => row.masterId), ['3040000000']);
  assert.deepEqual(filterRosterCapabilityRows(rows, { element: 'water', capability: 'dispel' }), []);
});
