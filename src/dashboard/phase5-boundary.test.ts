import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./phase5-ui.ts', import.meta.url), 'utf8');
const digest = readFileSync(new URL('./analysis-digest.ts', import.meta.url), 'utf8');
const dashboardCss = readFileSync(new URL('./phase5.css', import.meta.url), 'utf8');
const popupCss = readFileSync(new URL('../popup-responsive.css', import.meta.url), 'utf8');
const dashboardHtml = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
const dashboardEntry = readFileSync(new URL('../dashboard-entry.ts', import.meta.url), 'utf8');
const popupHtml = readFileSync(new URL('../../popup.html', import.meta.url), 'utf8');

test('phase 5 UI is local read/compare only with no GBF transport or persistence write primitives', () => {
  assert.match(ui, /loadAccountDatabase/);
  assert.doesNotMatch(ui, /fetch\s*\(|XMLHttpRequest|chrome\.debugger|chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(ui, /saveAccountDatabase|localStorage\.setItem|chrome\.storage\.(?:local|session)\.set|indexedDB\.open/);
  assert.doesNotMatch(ui, /combat\/storage|capture\/storage|capture\/types/);
  assert.match(ui, /parseAnalysisDigest\(await file\.text\(\)\)/);
  assert.match(ui, /phase5RenderRevision/);
  assert.doesNotMatch(ui, /card\.innerHTML\s*!==\s*markup/);
});

test('digest schema contains summary counts and quality but no raw identity/request fields', () => {
  assert.match(digest, /characters.*weapons.*summons.*artifacts.*treasures.*consumables.*tickets.*progression/s);
  assert.doesNotMatch(digest, /masterId|itemId|actorId|raidTechnicalId|cookie|authorization|headers|CapturedResponse/i);
  assert.match(digest, /rejectUnknownKeys/);
});

test('dashboard lazy-loads phase 5 polish surfaces without replacing existing controllers', () => {
  assert.match(dashboardHtml, /dashboard-entry\.ts/);
  assert.doesNotMatch(dashboardHtml, /roster-ui\.ts|combat-compare-ui\.ts|phase5-ui\.ts/);
  assert.match(dashboardEntry, /import\('\.\/dashboard\/roster-ui\.ts'\)/);
  assert.match(dashboardEntry, /import\('\.\/combat\/combat-compare-ui\.ts'\)/);
  assert.match(dashboardEntry, /import\('\.\/dashboard\/phase5-ui\.ts'\)/);
  assert.match(popupHtml, /popup-responsive\.css/);
  assert.match(popupHtml, /popup\.ts/);
});

test('responsive guardrails remove desktop-only minimums and include narrow layout breakpoints', () => {
  assert.match(dashboardCss, /body\s*\{[^}]*min-width:\s*0\s*!important/s);
  assert.match(dashboardCss, /@media \(max-width: 720px\)/);
  assert.match(dashboardCss, /\.dashboard-shell\s*\{[^}]*display:\s*block\s*!important/s);
  assert.match(dashboardCss, /\.detail-panel\s*\{[^}]*width:\s*100vw\s*!important/s);
  assert.match(popupCss, /min-width:\s*320px\s*!important/);
  assert.doesNotMatch(popupCss, /min-width:\s*380px/);
});
