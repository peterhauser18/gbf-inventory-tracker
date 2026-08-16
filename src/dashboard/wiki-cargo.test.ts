import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_SKILL_CARGO_FIELDS,
  loadWikiCargoRows,
  loadWikiCharacterSkillRows,
} from './wiki-cargo.ts';

test('Cargo loader stays bulk, credential-free and paginated on the approved Wiki host', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    const offset = Number(url.searchParams.get('offset'));
    const rows = offset === 0
      ? Array.from({ length: 500 }, (_, index) => ({ title: { id: String(index) } }))
      : [{ title: { id: 'last' } }];
    return { ok: true, status: 200, json: async () => ({ cargoquery: rows }) };
  };

  const rows = await loadWikiCargoRows('fixture_table', 'id,_pageName=page', fetcher);
  assert.equal(rows.length, 501);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.url.searchParams.get('offset')), ['0', '500']);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://gbf.wiki');
    assert.equal(call.url.pathname, '/api.php');
    assert.equal(call.url.searchParams.get('tables'), 'fixture_table');
    assert.equal(call.url.searchParams.has('where'), false);
    assert.equal(call.url.searchParams.has('ids'), false);
    assert.equal(call.init?.credentials, 'omit');
    assert.equal(call.init?.referrerPolicy, 'no-referrer');
  }
});

test('Character skill consumers share one canonical bulk field set', async () => {
  const calls: URL[] = [];
  const fetcher = async (input: string | URL) => {
    calls.push(new URL(input.toString()));
    return { ok: true, status: 200, json: async () => ({ cargoquery: [] }) };
  };

  await loadWikiCharacterSkillRows(fetcher);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.searchParams.get('tables'), 'character_skills');
  assert.equal(calls[0]?.searchParams.get('fields'), CHARACTER_SKILL_CARGO_FIELDS);
  assert.equal(calls[0]?.searchParams.has('where'), false);
});

test('malformed Cargo payloads fail closed instead of becoming an empty known table', async () => {
  const fetcher = async () => ({ ok: true, status: 200, json: async () => ({ error: { code: 'bad-field' } }) });
  await assert.rejects(
    loadWikiCargoRows('fixture_table', 'id', fetcher),
    /was not a row set/,
  );
});
