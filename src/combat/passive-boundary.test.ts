import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync(new URL('../background.ts', import.meta.url), 'utf8');
const parser = readFileSync(new URL('./parser.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('./storage.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('./dashboard.ts', import.meta.url), 'utf8');

test('combat ingestion remains attached only to debugger response-body capture', () => {
  assert.match(background, /Network\.getResponseBody/);
  assert.match(background, /ingestCapturedCombatRecord/);
  assert.match(background, /classifyObservedResponseUrl/);
  assert.match(background, /shouldReadObservedResponse/);
  for (const source of [background, parser, storage, dashboard]) {
    assert.doesNotMatch(source, /Network\.replayXHR|Network\.setRequestInterception|Network\.continueInterceptedRequest/);
    assert.doesNotMatch(source, /XMLHttpRequest|chrome\.scripting|executeScript\s*\(/);
    assert.doesNotMatch(source, /fetch\s*\(\s*['"`]https:\/\/game\.granbluefantasy\.jp/i);
  }
});

test('recognized combat responses persist only normalized combat facts', () => {
  const routeStart = background.indexOf('async function saveObservedResponse');
  const routeEnd = background.indexOf('async function updateCombatLock', routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  const routeSource = background.slice(routeStart, routeEnd);

  assert.match(routeSource, /const route = classifyObservedResponseUrl\(record\.meta\.url\)/);
  assert.match(routeSource, /if \(route === 'combat'\)/);
  assert.match(routeSource, /const state = await getRuntimeState\(\)/);
  assert.match(
    routeSource,
    /ingestCapturedCombatRecord\(record, combatInstanceForTab\(state, tabId\) \?\? null\)/,
  );
  assert.match(routeSource, /if \(parse\?\.instanceId\)/);
  assert.match(routeSource, /updateCombatLock\(tabId, parse\.instanceId, parse\.result\)/);
  assert.match(routeSource, /if \(route !== 'account'\) return/);
  assert.match(routeSource, /const context = weaponStashIngestContext\(tabId, record\)/);
  assert.match(routeSource, /await queueAccountIngest\(record, context\)/);
  assert.match(routeSource, /await saveCapturedResponse\(record\)/);

  const combatBranch = routeSource.slice(
    routeSource.indexOf("if (route === 'combat')"),
    routeSource.indexOf("if (route !== 'account')"),
  );
  assert.doesNotMatch(combatBranch, /saveCapturedResponse\(record\)|queueAccountIngest\(/);
});

test('raid instance correlation remains session-only and active rows store normalized parses only', () => {
  assert.match(storage, /CONTEXT_STATE_KEY = 'gbfit:combat-context-state-v2'/);
  assert.match(storage, /chrome\.storage\.session\.get\(\[CONTEXT_STATE_KEY, LEGACY_CONTEXT_KEY\]\)/);
  assert.match(storage, /chrome\.storage\.session\.set\(\{ \[CONTEXT_STATE_KEY\]: sanitizeContextState\(state\) \}\)/);
  assert.match(background, /clearCombatParseContext/);
  assert.match(storage, /interface ActiveRow \{ key: string; parse: NormalizedRaidParse; \}/);
  assert.doesNotMatch(storage, /interface ActiveRow[^\n]*context/);
  assert.match(storage, /\^30\[234\]\\d\{7\}\$/);
});
