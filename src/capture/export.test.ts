import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSanitizedExportBundle,
  captureExportFilename,
  CAPTURE_EXPORT_SCHEMA,
  CAPTURE_EXPORT_VERSION,
  selectRecordsForScan,
  serializeCaptureExport,
} from './export.ts';
import { emptyCaptureSummary } from './policy.ts';
import type { CapturedResponseRecord } from './types.ts';

const completedScan = {
  ...emptyCaptureSummary('scan-1', 100),
  stoppedAt: 200,
  responseCount: 1,
  categories: {
    ...emptyCaptureSummary('unused', 0).categories,
    weapons: true,
    roster: true,
  },
};

const record: CapturedResponseRecord = {
  id: 'scan-1:request-1',
  scanId: 'scan-1',
  meta: {
    requestId: 'request-1',
    url: 'https://game.granbluefantasy.jp/weapon/list?user_id=123&token=fixture-url-value',
    status: 200,
    mimeType: 'application/json',
    resourceType: 'xhr',
    capturedAt: 150,
  },
  body: {
    viewerId: 123456,
    user_name: 'Example Captain',
    profile: { id: 999, uid: 'profile-uid', name: 'Profile Captain', avatar_url: 'https://example.invalid/avatar/999' },
    session_token: 'fixture-session-value',
    nested: {
      Authorization: 'fixture-auth-value',
      csrf: 'fixture-csrf-value',
      password: 'fixture-password-value',
      weapon_id: 'weapon-123',
      master_id: 'master-456',
      instance_id: 'instance-789',
      name: 'Safe game object name',
      asset_url: 'https://assets.example/weapon.png?signature=fixture-asset-value',
    },
  },
  categories: ['weapons', 'roster'],
};

test('builds a versioned export with a deterministic second-pass sanitizer', () => {
  const poisonedRecord = {
    ...record,
    meta: {
      ...record.meta,
      headers: { Cookie: 'fixture-cookie-value', Authorization: 'fixture-header-value' },
      postData: 'fixture-post-body',
    },
  } as CapturedResponseRecord;

  const bundle = buildSanitizedExportBundle(completedScan, [poisonedRecord], 300);
  assert.equal(bundle.schema, CAPTURE_EXPORT_SCHEMA);
  assert.equal(bundle.version, CAPTURE_EXPORT_VERSION);
  assert.equal(bundle.exportedAt, 300);
  assert.equal(bundle.scan.responseCount, 1);
  assert.equal(bundle.responses.length, 1);
  assert.equal(bundle.responses[0]?.meta.url, 'https://game.granbluefantasy.jp/weapon/list');
  assert.deepEqual(Object.keys(bundle.responses[0]?.meta ?? {}).sort(), [
    'capturedAt',
    'mimeType',
    'requestId',
    'resourceType',
    'status',
    'url',
  ]);

  const body = bundle.responses[0]?.body as Record<string, unknown>;
  assert.equal(body.viewerId, '[account-identifier]');
  assert.equal(body.user_name, '[account-identifier]');
  assert.deepEqual(body.profile, {
    id: '[account-identifier]',
    uid: '[account-identifier]',
    name: '[account-identifier]',
    avatar_url: '[account-identifier]',
  });
  assert.equal('session_token' in body, false);

  const nested = body.nested as Record<string, unknown>;
  assert.equal('Authorization' in nested, false);
  assert.equal('csrf' in nested, false);
  assert.equal('password' in nested, false);
  assert.equal(nested.weapon_id, 'weapon-123');
  assert.equal(nested.master_id, 'master-456');
  assert.equal(nested.instance_id, 'instance-789');
  assert.equal(nested.name, 'Safe game object name');
  assert.equal(nested.asset_url, 'https://assets.example/weapon.png');

  const serialized = serializeCaptureExport(bundle);
  for (const forbiddenKey of ['session_token', 'Authorization', 'csrf', 'password']) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false, `${forbiddenKey} key must not be exported`);
  }

  for (const forbidden of [
    'fixture-url-value',
    'fixture-session-value',
    'fixture-auth-value',
    'fixture-csrf-value',
    'fixture-password-value',
    'fixture-cookie-value',
    'fixture-header-value',
    'fixture-post-body',
    'fixture-asset-value',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not be exported`);
  }
});

test('pseudonymizes generic identity fields and URL IDs in account-context responses', () => {
  const profileRecord: CapturedResponseRecord = {
    ...record,
    meta: {
      ...record.meta,
      url: 'https://game.granbluefantasy.jp/profile/content/index/12345678?tracking=fixture-tracking-value',
    },
    body: {
      id: 12345678,
      name: 'Captain Name',
      weapon_id: 'weapon-123',
      profile_link: 'https://game.granbluefantasy.jp/user/12345678?token=fixture-profile-url-value',
    },
  };

  const bundle = buildSanitizedExportBundle(completedScan, [profileRecord], 300);
  assert.equal(
    bundle.responses[0]?.meta.url,
    'https://game.granbluefantasy.jp/profile/content/index/account-identifier',
  );
  assert.deepEqual(bundle.responses[0]?.body, {
    id: '[account-identifier]',
    name: '[account-identifier]',
    weapon_id: 'weapon-123',
    profile_link: 'https://game.granbluefantasy.jp/user/account-identifier',
  });
  assert.equal(serializeCaptureExport(bundle).includes('12345678'), false);
});

test('selects only records belonging to the requested scan', () => {
  const other = { ...record, id: 'scan-2:request-2', scanId: 'scan-2' };
  assert.deepEqual(selectRecordsForScan([other, record], 'scan-1'), [record]);
});

test('refuses to export an active or incomplete capture', () => {
  const active = { ...completedScan, stoppedAt: undefined };
  assert.throws(() => buildSanitizedExportBundle(active, [record], 300), /Stop observation/);
  assert.throws(
    () => buildSanitizedExportBundle({ ...completedScan, responseCount: 2 }, [record], 300),
    /partial scan/,
  );
});

test('uses a predictable filename without scan or account identifiers', () => {
  assert.equal(captureExportFilename(Date.UTC(2026, 7, 15, 12)), 'gbf-scan-sanitized-2026-08-15.json');
});
