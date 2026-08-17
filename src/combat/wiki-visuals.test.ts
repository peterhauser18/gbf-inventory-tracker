import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combatWikiAssetCandidateFilenames,
  resolveWikiCombatAssetImage,
} from './wiki-visuals.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

test('combat visual candidates cover normal characters, MC leader assets, and Wiki enemy icons without game CDN URLs', () => {
  assert.deepEqual(combatWikiAssetCandidateFilenames('character', '450301'), [
    'Npc_s_450301.png',
    'Npc_s_450301.jpg',
    'Leader_pm_450301.png',
    'Leader_pm_450301.jpg',
    'Leader_s_450301.png',
  ]);
  assert.deepEqual(combatWikiAssetCandidateFilenames('boss', '8103533'), [
    'Enemy_Icon_8103533_S.png',
    'Enemy_Icon_8103533_M.png',
    'Enemy_Icon_8103533_L.png',
    'Quest_l_8103533.jpg',
    'Quest_l_8103533.png',
    'Enemy_s_8103533.png',
    'Enemy_m_8103533.png',
  ]);
  assert.deepEqual(combatWikiAssetCandidateFilenames('character', '../bad'), []);
});

test('combat visual resolver uses one credential-free Wiki metadata request and caches the result', async () => {
  const storage = new MemoryStorage();
  let requests = 0;
  let requestUrl = '';
  let credentials: RequestCredentials | undefined;
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    requests += 1;
    requestUrl = String(input);
    credentials = init?.credentials;
    return {
      ok: true,
      async json() {
        return {
          query: {
            pages: [
              { pageid: 1, title: 'File:Leader pm 450301.png' },
            ],
          },
        };
      },
    };
  };

  const first = await resolveWikiCombatAssetImage('character', '450301', fetcher, storage, 100);
  assert.equal(requests, 1);
  assert.match(requestUrl, /^https:\/\/gbf\.wiki\/api\.php\?/);
  assert.doesNotMatch(requestUrl, /granbluefantasy|akamaized/i);
  assert.equal(credentials, 'omit');
  assert.match(first ?? '', /^data:image\/gif;base64,/);
  assert.match(first ?? '', /#gbfit-wiki=/);

  const second = await resolveWikiCombatAssetImage('character', '450301', async () => {
    throw new Error('cache should avoid a second request');
  }, storage, 101);
  assert.equal(second, first);
});

test('boss resolver prefers the Wiki Enemy Icon filename used by raid pages', async () => {
  const storage = new MemoryStorage();
  let titles = '';
  const result = await resolveWikiCombatAssetImage('boss', '8103533', async (input) => {
    titles = new URL(String(input)).searchParams.get('titles') ?? '';
    return {
      ok: true,
      async json() {
        return { query: { pages: [{ pageid: 2, title: 'File:Enemy Icon 8103533 S.png' }] } };
      },
    };
  }, storage, 200);

  assert.match(titles, /File:Enemy_Icon_8103533_S\.png/);
  assert.match(result ?? '', /#gbfit-wiki=/);
});
