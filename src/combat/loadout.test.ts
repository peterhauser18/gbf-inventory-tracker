import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichRaidLoadout,
  loadoutSignaturesMatch,
  normalizeBattleStartLoadout,
  normalizePartyDeckLoadout,
  selectLateEnrichmentDecks,
  selectMatchingDeck,
  weaponBoostLabel,
} from './loadout.ts';

function deckBody(count = 10, priority = 84) {
  const weapons: Record<string, unknown> = {};
  for (let slot = 1; slot <= count; slot += 1) {
    weapons[String(slot)] = {
      master: { id: String(1040000000 + slot), name: `Weapon ${slot}` },
      param: { image_id: String(1040000000 + slot), hp: String(200 + slot), attack: String(3000 + slot), quality: slot === 7 ? '99' : '0' },
    };
  }
  return {
    deck: {
      priority,
      npc: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), { master: { id: String(3040000001 + index), name: `NPC ${index + 1}` } }])),
      pc: {
        job: { master: { id: '140401', name: 'Synthetic Job' } },
        weapons,
        summons: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), { master: { id: String(2040000001 + index), name: `Summon ${index + 1}` } }])),
        is_use_additional_weapon: count > 10,
        damage_info: {
          assumed_normal_damage: '953933',
          assumed_advantage_damage: '1372486',
          assumed_advantage_damage_attribute: '3',
          hp: '100439',
          weapon_skill_enhance_param: {
            weapon_skill_enhance: '280',
            weapon_skill_enhance_magna: '20',
            weapon_skill_enhance_evil: '0',
          },
          effect_value_info: [
            { icon_img: '01_icon_might_01.png', value: '708%', is_max: false },
            { icon_img: '04_icon_skill_dmg_supp.png', value: '+200000', is_max: true },
            { icon_img: '99_icon_future_effect.png', value: '12%', is_max: false },
          ],
        },
      },
    },
  };
}

function startBody() {
  return {
    viewer_id: 'synthetic-viewer',
    raid_id: 'raid-instance',
    quest_id: '305211',
    formation: ['0', '1', '2', '3'],
    back_formation: ['4', '5'],
    player: {
      param: [
        { name: 'Synthetic MC' },
        ...Array.from({ length: 5 }, (_, index) => ({ name: `NPC ${index + 1}`, setting_id: String(3040000001 + index) })),
      ],
    },
    summon: Array.from({ length: 5 }, (_, index) => ({ id: String(2040000001 + index), name: `Summon ${index + 1}` })),
    supporter: { id: '2040999999', name: 'Support' },
    weapon: { weapon: '1040000001', weapon2: '1040999999' },
    multi_raid_member_info: [
      { viewer_id: 'someone-else', job_id: '999999' },
      { viewer_id: 'synthetic-viewer', job_id: '140401' },
    ],
  };
}

test('normal party deck normalizes an ordered known 10-slot grid and observed calculator data', () => {
  const loadout = normalizePartyDeckLoadout(deckBody(), 1000);
  assert.ok(loadout);
  assert.equal(loadout.deckId, '84');
  assert.equal(loadout.weaponGridQuality, 'known');
  assert.equal(loadout.weapons.length, 10);
  assert.deepEqual(loadout.weapons.map((weapon) => weapon.slot), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(loadout.additionalWeaponsActive, false);
  assert.equal(loadout.jobId, '140401');
  assert.equal(loadout.jobName, 'Synthetic Job');
  assert.equal(loadout.calculator.quality, 'known');
  assert.equal(loadout.calculator.estimatedDamage, 953933);
  assert.equal(loadout.calculator.estimatedAdvantageDamage, 1372486);
  assert.equal(loadout.calculator.maxHp, 100439);
  assert.deepEqual(loadout.calculator.enhancement, { normal: 280, magna: 20, other: 0 });
  assert.equal(loadout.calculator.boosts[0]?.label, 'Might');
  assert.equal(loadout.calculator.boosts[1]?.label, 'Skill DMG Supp.');
  assert.equal(loadout.calculator.boosts[2]?.iconId, '99_icon_future_effect.png');
  assert.equal(loadout.calculator.boosts[2]?.label, 'Future Effect');
});

test('EX party preserves slots 11-13 without manufacturing additional empty slots', () => {
  const loadout = normalizePartyDeckLoadout(deckBody(13, 151), 1000);
  assert.ok(loadout);
  assert.equal(loadout.deckId, '151');
  assert.equal(loadout.weaponGridQuality, 'known');
  assert.equal(loadout.additionalWeaponsActive, true);
  assert.deepEqual(loadout.weapons.slice(-3).map((weapon) => weapon.slot), [11, 12, 13]);
  assert.equal(loadout.weapons.reduce((sum, weapon) => sum + (weapon.hp ?? 0), 0), 2691);
  assert.equal(loadout.weapons[6]?.plus, 99);
});

test('incomplete party deck stays partial instead of inventing a complete grid', () => {
  const body = deckBody(10) as any;
  delete body.deck.pc.weapons['6'];
  const loadout = normalizePartyDeckLoadout(body, 1000);
  assert.ok(loadout);
  assert.equal(loadout.weaponGridQuality, 'partial');
  assert.equal(loadout.weapons.some((weapon) => weapon.slot === 6), false);
});

test('battle start seeds authoritative party/summons/job while leaving the full weapon grid unknown', () => {
  const loadout = normalizeBattleStartLoadout(startBody(), 2000);
  assert.ok(loadout);
  assert.equal(loadout.weaponGridQuality, 'unknown');
  assert.equal(loadout.weapons.length, 0);
  assert.equal(loadout.party.length, 6);
  assert.equal(loadout.party[0]?.name, 'MC');
  assert.equal(loadout.summons.length, 6);
  assert.equal(loadout.summons[5]?.support, true);
  assert.equal(loadout.mainWeaponId, '1040000001');
  assert.equal(loadout.auxiliaryWeaponId, '1040999999');
  assert.equal(loadout.jobId, '140401');
  assert.equal(loadout.jobName, undefined);
  assert.deepEqual(loadout.signature.npcIds, ['3040000001','3040000002','3040000003','3040000004','3040000005']);
});

test('strict signature correlation requires all five NPCs, all five own summons and the main weapon', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const deck = normalizePartyDeckLoadout(deckBody(), 1000)!;
  assert.equal(loadoutSignaturesMatch(start.signature, deck.signature), true);
  const changed = normalizePartyDeckLoadout(deckBody(), 1000)!;
  changed.signature.summonIds[4] = 'different';
  assert.equal(loadoutSignaturesMatch(start.signature, changed.signature), false);
});

test('ambiguous matching decks never select or overwrite a raid grid without an observed deck id', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const one = normalizePartyDeckLoadout(deckBody(10, 84), 1000)!;
  const two = normalizePartyDeckLoadout(deckBody(10, 85), 1100)!;
  assert.equal(selectMatchingDeck(start.signature, [one]), one);
  assert.equal(selectMatchingDeck(start.signature, [one, two]), undefined);
});

test('observed selected deck id is authoritative even when the fallback signature differs', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  start.deckId = '84';
  const selected = normalizePartyDeckLoadout(deckBody(10, 84), 2100)!;
  selected.signature.summonIds[4] = 'different';
  const enriched = enrichRaidLoadout(start, selected);
  assert.equal(enriched.deckId, '84');
  assert.equal(enriched.correlation, 'deck-id');
  assert.equal(enriched.weaponGridQuality, 'known');
  assert.equal(enriched.weapons.length, 10);
});

test('late enrichment prefers one active signature match over older matching history in the same scan', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const deck = normalizePartyDeckLoadout(deckBody(), 2100)!;
  const assignments = selectLateEnrichmentDecks([
    { instanceId: 'old-raid', lastObservedAt: 1900, loadout: start, active: false },
    { instanceId: 'current-raid', lastObservedAt: 2200, loadout: start, active: true },
  ], [deck]);
  assert.equal(assignments.get('current-raid'), deck);
  assert.equal(assignments.has('old-raid'), false);
});

test('late enrichment still fails closed when two active raids only match by inferred signature', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const deck = normalizePartyDeckLoadout(deckBody(), 2100)!;
  const assignments = selectLateEnrichmentDecks([
    { instanceId: 'active-a', lastObservedAt: 2200, loadout: start, active: true },
    { instanceId: 'active-b', lastObservedAt: 2300, loadout: start, active: true },
  ], [deck]);
  assert.equal(assignments.size, 0);
});

test('exact selected deck ids can safely enrich matching active and historical raids independently', () => {
  const active = normalizeBattleStartLoadout(startBody(), 2000)!;
  const history = normalizeBattleStartLoadout(startBody(), 1900)!;
  active.deckId = '84';
  history.deckId = '84';
  active.signature.summonIds[4] = 'active-shape-drift';
  history.signature.summonIds[4] = 'history-shape-drift';
  const deck = normalizePartyDeckLoadout(deckBody(10, 84), 2100)!;
  const assignments = selectLateEnrichmentDecks([
    { instanceId: 'active-a', lastObservedAt: 2200, loadout: active, active: true },
    { instanceId: 'history-a', lastObservedAt: 1900, loadout: history, active: false },
  ], [deck]);
  assert.equal(assignments.get('active-a'), deck);
  assert.equal(assignments.get('history-a'), deck);
});

test('known selected deck id does not fall back to a different signature-matching deck', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  start.deckId = '85';
  const otherDeck = normalizePartyDeckLoadout(deckBody(10, 84), 2100)!;
  const assignments = selectLateEnrichmentDecks([
    { instanceId: 'raid-a', lastObservedAt: 2200, loadout: start, active: true },
  ], [otherDeck]);
  assert.equal(assignments.size, 0);
});

test('late enrichment attaches a known grid/calculator and preserves authoritative battle facts', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const known = normalizePartyDeckLoadout(deckBody(), 2100)!;
  const enriched = enrichRaidLoadout(start, known);
  assert.equal(enriched.weaponGridQuality, 'known');
  assert.equal(enriched.deckId, '84');
  assert.equal(enriched.jobId, '140401');
  assert.equal(enriched.jobName, 'Synthetic Job');
  assert.equal(enriched.calculator.quality, 'known');
  assert.equal(enriched.party[0]?.name, 'MC');
  assert.equal(enriched.summons.at(-1)?.support, true);
});

test('known grid does not block a later stronger calculator snapshot from the same correlated deck', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const gridOnly = normalizePartyDeckLoadout(deckBody(), 2100)!;
  gridOnly.calculator = { quality: 'unknown', enhancement: {}, boosts: [] };
  const gridKnown = enrichRaidLoadout(start, gridOnly);
  assert.equal(gridKnown.weaponGridQuality, 'known');
  assert.equal(gridKnown.calculator.quality, 'unknown');
  const complete = normalizePartyDeckLoadout(deckBody(), 2200)!;
  const enriched = enrichRaidLoadout(gridKnown, complete);
  assert.equal(enriched.weaponGridQuality, 'known');
  assert.equal(enriched.calculator.quality, 'known');
  assert.equal(enriched.calculator.estimatedDamage, 953933);
});

test('equal partial quality never downgrades a stronger partial grid', () => {
  const start = normalizeBattleStartLoadout(startBody(), 2000)!;
  const stronger = normalizePartyDeckLoadout(deckBody(), 2100)!;
  stronger.weaponGridQuality = 'partial';
  stronger.weapons = stronger.weapons.slice(0, 9);
  const partial = enrichRaidLoadout(start, stronger);
  assert.equal(partial.weapons.length, 9);
  const weaker = normalizePartyDeckLoadout(deckBody(), 2200)!;
  weaker.weaponGridQuality = 'partial';
  weaker.weapons = weaker.weapons.slice(0, 4);
  const unchanged = enrichRaidLoadout(partial, weaker);
  assert.equal(unchanged.weapons.length, 9);
});

test('boost labels preserve known semantics and keep unknown identifiers readable', () => {
  assert.equal(weaponBoostLabel('04_icon_normal_dmg_amp.png'), 'N.A. Amp.');
  assert.equal(weaponBoostLabel('01_icon_windoptimus.png'), 'Wind Optimus');
  assert.equal(weaponBoostLabel('02_icon_earth_reduc.png'), 'Earth Reduction');
  assert.equal(weaponBoostLabel('99_icon_future_effect.png'), 'Future Effect');
});
