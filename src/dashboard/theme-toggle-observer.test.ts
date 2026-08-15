import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./theme-toggle.ts', import.meta.url), 'utf8');

test('theme observer sync does not rewrite its observed child content when the label is unchanged', () => {
  assert.match(source, /observer\.observe\(app, \{ childList: true, subtree: true \}\)/);
  assert.match(source, /const label = dashboardThemeButtonLabel\(theme\);/);
  assert.match(source, /if \(button\.textContent !== label\) button\.textContent = label;/);
  assert.doesNotMatch(source, /button\.textContent = dashboardThemeButtonLabel\(theme\);/);
});
