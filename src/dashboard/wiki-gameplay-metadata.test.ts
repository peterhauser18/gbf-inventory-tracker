import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadWikiGameplayFamily,
  loadWikiGameplayMetadata,
  normalizeWikiGameplayText,
  normalizeWikiTitle,
  selectSummonGameplay,
} from './wiki-gameplay-metadata.ts';

function gameplayFetcher(failTable?: string, calls?: string[]) {
  return async (input: string | URL) => {
    const url = new URL(input.toString());
    const table = url.searchParams.get('tables') ?? '';
    calls?.push(table);
    if (table === failTable) return { ok: false, status: 503, json: async () => ({}) };

    const rows = table === 'character_skills'
      ? [
          { character_id: '3040000000', page: 'Fixture Hero', ix: '2', type: 'skill', name: 'Second Skill', description: 'Gain {{Status|Shield}}.', sort_order: '12' },
          { character_id: '3040000000', page: 'Fixture Hero', ix: '1', type: 'skill', name: 'First Skill', description: "Remove 1 foe's [[Buff|buff]].", sort_order: '11' },
          { character_id: '3040000000', page: 'Fixture Hero', ix: '1a', type: 'alt', name: 'Alternate Skill', description: 'Do not surface this.', sort_order: '111' },
        ]
      : table === 'weapon_skills'
        ? [
            { page: 'Fixture Weapon', ix: '2', type: 'base', upgrade: '0', name: 'Second Weapon Skill', description: 'Boost to HP.' },
            { page: 'Fixture Weapon', ix: '1', type: 'base', upgrade: '2', name: 'Upgraded Skill', description: 'Later effect.' },
            { page: 'Fixture Weapon', ix: '1', type: 'base', upgrade: '0', name: 'First Weapon Skill', description: 'Boost to ATK.' },
            { page: 'Fixture Weapon', ix: '1', type: 'aux', upgrade: '0', name: 'Auxiliary', description: 'Ignore.' },
          ]
        : table === 'summons'
          ? [{
              id: '2040000000', page: 'Fixture Summon', call_name: 'Fixture Call',
              call1: 'Base call.', call2: '3-star call.', call3: '4-star call.', call4: '', call5: '',
              aura1: 'Base aura.', aura2: '3-star aura.', aura3: '', aura4: '', aura5: '',
            }]
          : [];

    return { ok: true, status: 200, json: async () => ({ cargoquery: rows.map((title) => ({ title })) }) };
  };
}

test('normalizes and orders only proven active Character skills', async () => {
  const metadata = await loadWikiGameplayMetadata(gameplayFetcher());
  assert.deepEqual(metadata.charactersById.get('3040000000'), [
    { name: 'First Skill', description: "Remove 1 foe's buff." },
    { name: 'Second Skill', description: 'Gain Shield.' },
  ]);
  assert.equal(metadata.sourceQuality.characters, 'known');
});

test('normalizes base Weapon skills without inferring effects from account skill level', async () => {
  const metadata = await loadWikiGameplayMetadata(gameplayFetcher());
  assert.deepEqual(metadata.weaponsByTitle.get(normalizeWikiTitle('Fixture_Weapon')), [
    { name: 'First Weapon Skill', description: 'Boost to ATK.' },
    { name: 'Second Weapon Skill', description: 'Boost to HP.' },
  ]);
});

test('selects separate Summon Call and Aura text for observed uncap with downward fallback', async () => {
  const metadata = await loadWikiGameplayMetadata(gameplayFetcher());
  const source = metadata.summonsById.get('2040000000');

  assert.deepEqual(selectSummonGameplay(source, 3), {
    call: { name: 'Fixture Call', description: '3-star call.' },
    aura: { description: '3-star aura.' },
  });
  assert.deepEqual(selectSummonGameplay(source, 5), {
    call: { name: 'Fixture Call', description: '4-star call.' },
    aura: { description: '3-star aura.' },
  });
});

test('one failed public table stays unavailable without discarding proven other families', async () => {
  const metadata = await loadWikiGameplayMetadata(gameplayFetcher('weapon_skills'));
  assert.equal(metadata.sourceQuality.weapons, 'unknown');
  assert.deepEqual(metadata.weaponsByTitle.get('fixture weapon'), undefined);
  assert.equal(metadata.charactersById.get('3040000000')?.[0]?.name, 'First Skill');
  assert.equal(metadata.summonsById.get('2040000000')?.callName, 'Fixture Call');
});

test('family loader requests only the selected public Cargo table', async () => {
  const cases = [
    ['characters', 'character_skills'],
    ['weapons', 'weapon_skills'],
    ['summons', 'summons'],
  ] as const;
  for (const [family, table] of cases) {
    const calls: string[] = [];
    await loadWikiGameplayFamily(family, gameplayFetcher(undefined, calls));
    assert.deepEqual(calls, [table]);
  }
});

test('Wiki markup is reduced to escaped-render-safe plain text without inventing missing text', () => {
  assert.equal(normalizeWikiGameplayText("'''Strong'''<br>[[Status|ATK Up]] &amp; {{Status|Shield}}"), 'Strong ATK Up & Shield');
  assert.equal(normalizeWikiGameplayText('   '), undefined);
});
