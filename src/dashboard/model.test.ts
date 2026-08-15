import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardViewModel } from './model.ts';
import { findUpgradeGoal } from '../data/requirements.ts';
import type { EntityMetadataIndex } from './wiki-metadata.ts';
import type { AccountSnapshot } from '../types/account.ts';

function snapshot(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    characters: [],
    weapons: [],
    summons: [],
    artifacts: [],
    weaponStashes: [],
    treasures: [],
    consumables: [],
    tickets: [],
    progression: [],
    quality: {
      characters: 'partial',
      weapons: 'partial',
      summons: 'known',
      artifacts: 'unknown',
      treasures: 'known',
      consumables: 'partial',
      tickets: 'known',
      accountStatus: 'known',
      progression: 'unknown',
    },
    capturedAt: 100,
    ...overrides,
  };
}

function metadata(): EntityMetadataIndex {
  return {
    characters: new Map([
      ['3040999000', {
        masterId: '3040999000',
        name: 'Fixture Hero',
        wikiTitle: 'Fixture Hero (Summer)',
        imageUrl: 'https://gbf.wiki/Special:Redirect/file/Fixture%20Hero%20iconA.jpg',
      }],
    ]),
    weapons: new Map([
      ['1040000000', {
        masterId: '1040000000',
        name: 'Fixture Blade',
        wikiTitle: 'Fixture Blade',
        imageUrl: 'https://gbf.wiki/Special:Redirect/file/Weapon%20ls%201040000000.jpg',
      }],
    ]),
    summons: new Map([
      ['2040000000', {
        masterId: '2040000000',
        name: 'Fixture Beast',
        wikiTitle: 'Fixture Beast',
        imageUrl: 'https://gbf.wiki/Special:Redirect/file/Summon%20ls%202040000000.jpg',
      }],
    ]),
  };
}

test('builds all dashboard families and keeps missing special characters unknown under partial roster coverage', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-character-instance', masterId: '3040030000', level: 80, uncap: 4, awakeningLevel: 7, updatedAt: 1 },
    ],
    treasures: [
      { itemId: '102', name: 'Indicus Centrum', quantity: 35, updatedAt: 1 },
      { itemId: '112', name: 'Water Urn', quantity: 5, updatedAt: 1 },
    ],
    weapons: [{ id: 'fixture-weapon-instance', masterId: '1040000000', level: 150, updatedAt: 1 }],
    summons: [{ id: 'fixture-summon-instance', masterId: '2040000000', level: 100, updatedAt: 1 }],
    weaponStashes: [{ stashId: 'fixture-stash', weapons: [], quality: 'known' }],
  }));

  assert.equal(model.eternals.length, 10);
  assert.equal(model.evokers.length, 10);
  const anre = model.eternals.find((card) => card.title === 'Anre');
  const tweyen = model.eternals.find((card) => card.title === 'Tweyen');
  assert.equal(anre?.targetDisplay, '5★');
  assert.equal(anre?.targetReached, false);
  assert.equal(anre?.steps.length, 10);
  assert.deepEqual(anre?.steps.map((step) => step.targetDisplay), ['1★', '2★', '3★', '4★', '5★', 'Lv110', 'Lv120', 'Lv130', 'Lv140', 'Lv150']);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Indicus Centrum')?.missing, 0);
  assert.equal(anre?.materialPlan.materials.find((row) => row.name === 'Water Urn')?.missing, 5);
  assert.deepEqual(anre?.steps[0]?.prerequisiteEvidence.map((row) => row.label), ['Character recruited']);
  assert.match(anre?.steps[1]?.prerequisiteEvidence[1]?.label ?? '', /Previous uncap 1★/);
  assert.match(anre?.steps[4]?.prerequisiteEvidence[1]?.label ?? '', /4★ uncap/);
  assert.equal(tweyen?.prerequisiteEvidence[0]?.state, 'unknown');
  assert.equal(model.weapons[0]?.wikiUrl.includes('fixture-weapon-instance'), false);
  assert.equal(model.stashes[0]?.quality, 'known');
});

test('resolves names, canonical wiki links and safe images for roster and stash entities', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [{ id: 'character-instance', masterId: '3040999000', level: 80, uncap: 4, updatedAt: 1 }],
    weapons: [{ id: 'weapon-instance', masterId: '1040000000', level: 100, updatedAt: 1 }],
    summons: [{ id: 'summon-instance', masterId: '2040000000', level: 100, updatedAt: 1 }],
    weaponStashes: [{
      stashId: 'stash-a',
      quality: 'known',
      weapons: [{ id: 'stash-weapon', masterId: '1040000000', level: 1, updatedAt: 1 }],
    }],
  }), metadata());

  assert.equal(model.characters[0]?.title, 'Fixture Hero');
  assert.match(model.characters[0]?.wikiUrl ?? '', /Fixture_Hero_\(Summer\)/);
  assert.match(model.characters[0]?.imageUrl ?? '', /^https:\/\/gbf\.wiki\//);
  assert.equal(model.weapons[0]?.title, 'Fixture Blade');
  assert.equal(model.summons[0]?.title, 'Fixture Beast');
  assert.equal(model.stashes[0]?.children?.[0]?.title, 'Fixture Blade');
  assert.equal(model.stashes[0]?.children?.[0]?.detailFields[0]?.value, 'stash-a');
});

test('keeps technical fallbacks when public metadata is unavailable', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [{ id: 'character-instance', masterId: '3040999000', updatedAt: 1 }],
  }));
  assert.equal(model.characters[0]?.title, 'Character 3040999000');
  assert.equal(model.characters[0]?.imageUrl, undefined);
  assert.match(model.characters[0]?.wikiUrl ?? '', /search=Character\+3040999000/);
});

test('selects Eternal Stage 1 Transcendence as the next target after 5-star while retaining the full uncap/transcendence chain', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-seofon', masterId: '3040036000', level: 100, uncap: 5, awakeningLevel: 9, updatedAt: 1 },
    ],
    accountStatus: { rank: 394, updatedAt: 1 },
    treasures: [
      { itemId: '5411', name: 'Silver Sword Shard', quantity: 75, updatedAt: 1 },
      { itemId: '552', name: 'Gale Rock', quantity: 60, updatedAt: 1 },
      { itemId: '5241', name: 'Wind Halo', quantity: 90, updatedAt: 1 },
      { itemId: '203', name: 'Damascus Crystal', quantity: 25, updatedAt: 1 },
    ],
    consumables: [
      { itemId: '20004', itemKindId: '17', group: '1', name: 'Gold Brick', quantity: 3, updatedAt: 1 },
    ],
  }));

  const seofon = model.eternals.find((card) => card.title === 'Seofon');
  assert.equal(seofon?.targetDisplay, 'Lv110');
  assert.equal(seofon?.targetReached, false);
  assert.match(seofon?.targetLabel ?? '', /Transcendence Stage 1/);
  assert.deepEqual(seofon?.steps.map((step) => step.targetDisplay), ['1★', '2★', '3★', '4★', '5★', 'Lv110', 'Lv120', 'Lv130', 'Lv140', 'Lv150']);
  assert.deepEqual(seofon?.steps.slice(0, 6).map((step) => [step.targetDisplay, step.targetReached]), [
    ['1★', true],
    ['2★', true],
    ['3★', true],
    ['4★', true],
    ['5★', true],
    ['Lv110', false],
  ]);
  const lv110 = seofon?.steps[5];
  assert.equal(lv110?.materialPlan.materials.find((row) => row.name === 'Gold Brick')?.missing, 0);
  assert.equal(lv110?.materialPlan.materials.find((row) => row.name === 'Silver Sword Shard')?.missing, 125);
  assert.equal(lv110?.prerequisiteEvidence.find((row) => row.label === 'Player Rank 150')?.satisfied, true);
  assert.equal(lv110?.prerequisiteEvidence.find((row) => row.label === 'Awakening 7')?.satisfied, true);
  assert.equal(lv110?.prerequisiteEvidence.find((row) => row.label.startsWith('Fourth skill'))?.state, 'unknown');
});

test('selects current Evoker Stage 1 target where supported and leaves unavailable higher targets truthful', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-caim', masterId: '3040164000', level: 100, uncap: 5, awakeningLevel: 10, updatedAt: 1 },
      { id: 'fixture-katzelia', masterId: '3040166000', level: 100, uncap: 5, awakeningLevel: 10, updatedAt: 1 },
    ],
    accountStatus: { rank: 394, updatedAt: 1 },
  }));
  const caim = model.evokers.find((card) => card.title === 'Caim');
  const katzelia = model.evokers.find((card) => card.title === 'Katzelia');
  assert.deepEqual(caim?.steps.map((step) => step.targetDisplay), ['1★', '2★', '3★', '4★', '5★', 'Lv110']);
  assert.equal(caim?.targetDisplay, 'Lv110');
  assert.equal(caim?.targetReached, false);
  assert.match(caim?.targetLabel ?? '', /Transcendence Stage 1/);
  assert.deepEqual(katzelia?.steps.map((step) => step.targetDisplay), ['1★', '2★', '3★', '4★', '5★']);
  assert.equal(katzelia?.targetDisplay, '5★');
  assert.equal(katzelia?.targetReached, true);
  assert.match(katzelia?.notes[0] ?? '', /No later verified stage/);
});

test('does not infer a transcendence level from the shared sixth-star uncap alone', () => {
  const model = buildDashboardViewModel(snapshot({
    characters: [
      { id: 'fixture-seofon-no-level', masterId: '3040036000', uncap: 6, awakeningLevel: 9, updatedAt: 1 },
    ],
  }));
  const seofon = model.eternals.find((card) => card.title === 'Seofon');
  assert.equal(seofon?.steps.find((step) => step.targetDisplay === 'Lv110')?.targetReached, undefined);
  assert.equal(seofon?.steps.find((step) => step.targetDisplay === 'Lv150')?.targetReached, undefined);
});


test('models split Verum Proofs and haze variants for light/dark Evoker uncaps', () => {
  const geisen4 = findUpgradeGoal('evoker-geisenborger-4star');
  const nier4 = findUpgradeGoal('evoker-nier-4star');
  assert.deepEqual(
    geisen4?.requirements.filter((row) => row.name.endsWith('Verum Proof')).map((row) => [row.name, row.quantity]),
    [['Fire Verum Proof', 5], ['Wind Verum Proof', 5]],
  );
  assert.equal(geisen4?.requirements.find((row) => row.name === 'Aurora Haze')?.quantity, 3);
  assert.deepEqual(
    nier4?.requirements.filter((row) => row.name.endsWith('Verum Proof')).map((row) => [row.name, row.quantity]),
    [['Water Verum Proof', 5], ['Earth Verum Proof', 5]],
  );
  assert.equal(nier4?.requirements.find((row) => row.name === 'Chaotic Haze')?.quantity, 3);
});
