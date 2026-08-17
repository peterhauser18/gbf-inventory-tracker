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

test('combat visual candidates cover normal characters, MC leader assets, and bosses without game CDN URLs', () => {
  assert.deepEqual(combatWikiAssetCandidateFilenames('character', '450301'), [
    'Npc_s_450301.png',
    'Npc_s_450301.jpg',
    'Leader_pm_450301.png',
    'Leader_pm_450301.jpg',
    'Leader_s_450301.png',
  ]);
  assert.deepEqual(combatWikiAssetCandidateFilenames('boss', '1234567'), [
    'Quest_l_1234567.jpg',
    'Quest_l_1234567.png',
    'Enemy_s_1234567.png',
    'Enemy_m_1234567.png',
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
