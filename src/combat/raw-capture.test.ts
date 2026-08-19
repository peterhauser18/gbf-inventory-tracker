import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildRawCombatCaptureExport,
  buildRawCombatCaptureRecord,
  containsSensitiveJsonKey,
  rawCombatCaptureState,
  shouldPersistRawCombatResponse,
} from './raw-capture.ts';
import type { ObservedResponse } from '../capture/types.ts';

const combatMeta: ObservedResponse = {
  requestId: 'combat-request-1',
  url: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json?_=debug',
  resourceType: 'fetch',
  status: 200,
  mimeType: 'application/json',
};

test('raw combat persistence is opt-in, owner-tab scoped, and limited to verified combat responses', () => {
  const expectedOwner = 'chrome-extension://extension-id/combat.html';
  const owner = `${expectedOwner}?rawCapture=1`;
  const active = rawCombatCaptureState(42, 100);

  assert.equal(shouldPersistRawCombatResponse(active, owner, expectedOwner, combatMeta), true);
  assert.equal(shouldPersistRawCombatResponse({ ...active, enabled: false }, owner, expectedOwner, combatMeta), false);
  assert.equal(shouldPersistRawCombatResponse(active, expectedOwner, expectedOwner, combatMeta), false);
  assert.equal(shouldPersistRawCombatResponse(active, owner, expectedOwner, {
    ...combatMeta,
    url: 'https://game.granbluefantasy.jp/quest/start',
  }), false);
});

test('raw capture preserves complete gameplay JSON and strips URL query metadata', () => {
  const body = {
    scenario: [
      { cmd: 'attack', pos: 0, damage: [{ value: 123456, critical: false }] },
      { cmd: 'special', pos: 1, list: [{ value: 7654321 }] },
    ],
    status: { boss: { hp: 99999999 }, turn: 7 },
  };
  const record = buildRawCombatCaptureRecord(combatMeta, JSON.stringify(body), 1234);

  assert.ok(record);
  assert.equal(record.url, 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json');
  assert.deepEqual(record.body, body);
  assert.deepEqual(Object.keys(record).sort(), ['body', 'capturedAt', 'id', 'url']);
});

test('credential-like response fields are rejected instead of being partially persisted', () => {
  const unsafe = { scenario: [], session_id: 'real-secret-value' };
  assert.equal(containsSensitiveJsonKey(unsafe), true);
  assert.equal(buildRawCombatCaptureRecord(combatMeta, JSON.stringify(unsafe), 1234), null);
});

test('raw export omits internal request ids and preserves ordered full bodies', () => {
  const state = { ...rawCombatCaptureState(42, 100), skippedSensitive: 2 };
  const bundle = buildRawCombatCaptureExport(state, [
    { id: 'b', capturedAt: 20, url: 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json', body: { second: true } },
    { id: 'a', capturedAt: 10, url: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json', body: { first: true } },
  ], 30);

  assert.equal(bundle.format, 'gbf-tool-raw-combat-capture');
  assert.equal(bundle.skippedSensitive, 2);
  assert.deepEqual(bundle.records, [
    { capturedAt: 10, url: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json', body: { first: true } },
    { capturedAt: 20, url: 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json', body: { second: true } },
  ]);
  assert.equal(JSON.stringify(bundle).includes('combat-request-1'), false);
});

test('popup places Raw Capture Mode first in Developer and raw page exposes export and clear controls', () => {
  const popupCombat = readFileSync(new URL('../popup-combat.ts', import.meta.url), 'utf8');
  const combatEntry = readFileSync(new URL('../combat-entry.ts', import.meta.url), 'utf8');
  const rawCaptureSource = readFileSync(new URL('./raw-capture.ts', import.meta.url), 'utf8');

  assert.match(popupCombat, /Open Combat Tracker Raw Capture Mode/);
  assert.match(popupCombat, /developerContent\.prepend\(rawButton\)/);
  assert.ok(
    popupCombat.indexOf("developerContent.prepend(rawButton)") < popupCombat.indexOf("rawButton.addEventListener"),
    'raw launcher is inserted as the first Developer child before wiring the rest of its behavior',
  );
  assert.match(popupCombat, /combat\.html\?rawCapture=1/);
  assert.match(combatEntry, /RAW CAPTURE MODE/);
  assert.match(combatEntry, /Export Raw JSON/);
  assert.match(combatEntry, /Clear Raw Capture/);
  assert.match(rawCaptureSource, /clearRawCombatCaptureStorage\(\)/);
  assert.match(rawCaptureSource, /store\.clear\(\)/);
  assert.doesNotMatch(rawCaptureSource, /requestHeaders|responseHeaders|authorizationHeader|cookieHeader/);
});
