import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(
  readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'),
) as { permissions?: string[]; host_permissions?: string[] };

test('dashboard does not require a new broad browser or host permission', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'debugger']);
  assert.equal(manifest.host_permissions, undefined);
});
