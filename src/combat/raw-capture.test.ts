import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildRawCombatCaptureExport,
  buildRawCombatCaptureRecord,
  countSensitiveJsonKeys,
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

test('raw combat persistence is opt-in, owner-tab scoped, and limited to canonically verified combat responses', () => {
  const active = rawCombatCaptureState(42, 100);

  assert.equal(shouldPersistRawCombatResponse(active, true, combatMeta, true), true);
  assert.equal(shouldPersistRawCombatResponse({ ...active, enabled: false }, true, combatMeta, true), false);
  assert.equal(shouldPersistRawCombatResponse(active, false, combatMeta, true), false);
  assert.equal(shouldPersistRawCombatResponse(active, true, combatMeta, false), false);
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
  assert.equal(record.redactedSensitiveFields, 0);
  assert.deepEqual(record.body, body);
  assert.deepEqual(Object.keys(record).sort(), ['body', 'capturedAt', 'id', 'redactedSensitiveFields', 'url']);
});

test('credential-like response values are redacted in place without dropping gameplay evidence', () => {
  const body = {
    scenario: [
      { cmd: 'attack', pos: 0, damage: [{ value: 123456 }] },
      { cmd: 'special', pos: 1, list: [{ value: 7654321 }] },
    ],
    session_id: 'real-session-value',
    nested: {
      authToken: 'real-token-value',
      boss: { hp: 99999999 },
    },
  };

  assert.equal(countSensitiveJsonKeys(body), 2);
  const record = buildRawCombatCaptureRecord(combatMeta, JSON.stringify(body), 1234);

  assert.ok(record);
  assert.equal(record.redactedSensitiveFields, 2);
  assert.deepEqual(record.body, {
    scenario: body.scenario,
    session_id: '[redacted]',
    nested: {
      authToken: '[redacted]',
      boss: { hp: 99999999 },
    },
  });
  assert.equal(JSON.stringify(record.body).includes('real-session-value'), false);
  assert.equal(JSON.stringify(record.body).includes('real-token-value'), false);
});

test('raw export omits internal request ids and preserves ordered redacted bodies', () => {
  const state = { ...rawCombatCaptureState(42, 100), redactedSensitiveFields: 2 };
  const bundle = buildRawCombatCaptureExport(state, [
    {
      id: 'b',
      capturedAt: 20,
      url: 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json',
      redactedSensitiveFields: 0,
      body: { second: true },
    },
    {
      id: 'a',
      capturedAt: 10,
      url: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json',
      redactedSensitiveFields: 2,
      body: { first: true, session_id: '[redacted]' },
    },
  ], 30);

  assert.equal(bundle.format, 'gbf-tool-raw-combat-capture');
  assert.equal(bundle.redactedSensitiveFields, 2);
  assert.deepEqual(bundle.records, [
    {
      capturedAt: 10,
      url: 'https://game.granbluefantasy.jp/rest/multiraid/normal_attack_result.json',
      redactedSensitiveFields: 2,
      body: { first: true, session_id: '[redacted]' },
    },
    {
      capturedAt: 20,
      url: 'https://game.granbluefantasy.jp/rest/multiraid/ability_result.json',
      redactedSensitiveFields: 0,
      body: { second: true },
    },
  ]);
  assert.equal(JSON.stringify(bundle).includes('combat-request-1'), false);
});

test('popup places Raw Capture Mode first in Developer and raw page exposes export and clear controls', () => {
  const popupCombat = readFileSync(new URL('../popup-combat.ts', import.meta.url), 'utf8');
  const combatEntry = readFileSync(new URL('../combat-entry.ts', import.meta.url), 'utf8');
  const observer = readFileSync(new URL('../capture/observer.ts', import.meta.url), 'utf8');
  const rawCaptureSource = readFileSync(new URL('./raw-capture.ts', import.meta.url), 'utf8');

  assert.match(popupCombat, /Open Combat Tracker Raw Capture Mode/);
  assert.match(popupCombat, /developerContent\.prepend\(rawButton\)/);
  assert.match(popupCombat, /combat\.html\?rawCapture=1/);
  assert.match(combatEntry, /RAW CAPTURE MODE/);
  assert.match(combatEntry, /Export Raw JSON/);
  assert.match(combatEntry, /Clear Raw Capture/);
  assert.match(combatEntry, /replaced with \[redacted\]/);
  assert.match(observer, /classifyObservedResponseUrl\(meta\.url\) === 'combat'/);
  assert.match(rawCaptureSource, /redactSensitiveJson\(body\)/);
  assert.match(rawCaptureSource, /countSensitiveJsonKeys\(body\)/);
  assert.match(rawCaptureSource, /chrome\.tabs\.onRemoved\.addListener/);
  assert.match(rawCaptureSource, /clearRawCombatCaptureStorage\(\)/);
  assert.match(rawCaptureSource, /store\.clear\(\)/);
  assert.doesNotMatch(rawCaptureSource, /\.url;/, 'owner-tab lifecycle must not require sensitive Tab.url access');
  assert.doesNotMatch(rawCaptureSource, /requestHeaders|responseHeaders|authorizationHeader|cookieHeader/);
  assert.doesNotMatch(rawCaptureSource, /fetch\(|XMLHttpRequest|webRequest|chrome\.debugger/);
  assert.doesNotMatch(combatEntry, /fetch\(|XMLHttpRequest|webRequest|chrome\.debugger/);
});
