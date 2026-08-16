import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8')) as {
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
};
const dashboardBrand = readFileSync(new URL('./brand.css', import.meta.url), 'utf8');
const popupStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('unpacked extension icon slots use local PNG mascot assets', () => {
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/gbf-tracker-${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/gbf-tracker-${size}.png`);
  }
});

test('popup and dashboard brand surfaces use the mascot and GBF Tracker name', () => {
  assert.match(popupStyles, /icons\/gbf-tracker-128\.png/);
  assert.match(dashboardBrand, /icons\/gbf-tracker-128\.png/);
  assert.match(dashboardBrand, /GBF Tracker/);
});
