import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8')) as {
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
};
const dashboardBrand = readFileSync(new URL('./brand.css', import.meta.url), 'utf8');
const popupStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const brandRuntime = readFileSync(new URL('../brand-runtime.ts', import.meta.url), 'utf8');
const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../../popup.html', import.meta.url), 'utf8');

test('unpacked extension icon slots use local PNG mascot assets', () => {
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `icons/gbf-tracker-${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icons/gbf-tracker-${size}.png`);
  }
});

test('popup and dashboard resolve their mascot from the extension runtime URL', () => {
  assert.match(brandRuntime, /chrome\.runtime\.getURL\('icons\/gbf-tracker-128\.png'\)/);
  assert.match(dashboardBrand, /--gbf-brand-image/);
  assert.match(popupStyles, /--gbf-brand-image/);
  assert.match(dashboardHtml, /src\/brand-runtime\.ts/);
  assert.match(popupHtml, /src\/brand-runtime\.ts/);
  assert.match(dashboardBrand, /GBF Tracker/);
});
