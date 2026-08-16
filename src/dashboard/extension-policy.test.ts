import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
) as { permissions?: string[]; host_permissions?: string[]; content_scripts?: unknown[] };

test('extension has no GBF page injection and keeps browser permissions narrow', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'debugger']);
  assert.deepEqual(manifest.host_permissions, ['https://gbf.wiki/*']);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.host_permissions?.some((host) => /granbluefantasy|akamaized|mizagbf/i.test(host)), false);
});
