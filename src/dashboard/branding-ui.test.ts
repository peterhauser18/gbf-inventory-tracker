import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8')) as {
  version: string;
  icons: Record<string, string>;
  action: { default_icon: Record<string, string> };
};
const dashboardBrand = readFileSync(new URL('./brand.css', import.meta.url), 'utf8');
const popupStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const brandRuntime = readFileSync(new URL('../brand-runtime.ts', import.meta.url), 'utf8');
const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../../popup.html', import.meta.url), 'utf8');

test('extension branding uses the refreshed management icon asset', () => {
  assert.equal(manifest.version, '0.1.1');
  assert.equal(manifest.icons['48'], 'icons/gbf-tracker-v2-48.png');
  assert.equal(manifest.action.default_icon['48'], 'icons/gbf-tracker-v2-48.png');
  assert.equal(manifest.icons['16'], 'icons/gbf-tracker-16.png');
  assert.equal(manifest.icons['32'], 'icons/gbf-tracker-32.png');
  assert.equal(manifest.icons['128'], 'icons/gbf-tracker-128.png');
});

test('popup and dashboard render real mascot image elements from extension URLs', () => {
  assert.match(brandRuntime, /chrome\.runtime\.getURL\('icons\/gbf-tracker-v2-48\.png'\)/);
  assert.match(brandRuntime, /document\.createElement\('img'\)/);
  assert.match(brandRuntime, /popupHeader\.prepend/);
  assert.match(brandRuntime, /dashboardBrand\.prepend/);
  assert.match(brandRuntime, /heading\.textContent = 'GBF Tracker'/);
  assert.match(popupStyles, /gbf-popup-brand-icon/);
  assert.match(dashboardBrand, /gbf-dashboard-brand-icon/);
  assert.doesNotMatch(popupStyles, /gbf-brand-image/);
  assert.doesNotMatch(dashboardBrand, /gbf-brand-image/);
  assert.match(dashboardHtml, /src\/brand-runtime\.ts/);
  assert.match(popupHtml, /src\/brand-runtime\.ts/);
});
