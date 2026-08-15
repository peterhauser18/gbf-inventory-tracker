import type { WikiDropReference } from './types.ts';

export interface WikiFetchOptions {
  fetchImpl?: typeof fetch;
}

export async function loadWikiDropReferences(
  raidName: string,
  itemNames: string[],
  options: WikiFetchOptions = {},
): Promise<Map<string, WikiDropReference>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiUrl = buildWikiApiUrl(raidName);
  const response = await fetchImpl(apiUrl, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`GBF Wiki request failed: ${response.status}`);
  const payload = await response.json() as unknown;
  const sourceUrl = buildWikiPageUrl(raidName);
  const result = new Map<string, WikiDropReference>();
  if (!isObject(payload) || !isObject(payload.parse)) {
    for (const itemName of itemNames) result.set(itemName, unavailable(sourceUrl, 'No structured wiki page data was returned.'));
    return result;
  }
  const revisionId = numberValue(payload.parse.revid);
  const freshness = revisionId !== undefined ? `revision ${revisionId}` : undefined;
  const wikitextObject = isObject(payload.parse.wikitext) ? payload.parse.wikitext : undefined;
  const wikitext = typeof wikitextObject?.['*'] === 'string' ? wikitextObject['*'] : undefined;
  if (!wikitext) {
    for (const itemName of itemNames) result.set(itemName, unavailable(sourceUrl, 'The wiki page did not expose wikitext for drop parsing.', freshness));
    return result;
  }
  for (const itemName of itemNames) result.set(itemName, parseItemReference(wikitext, itemName, sourceUrl, freshness));
  return result;
}

export function buildWikiApiUrl(raidName: string): string {
  const url = new URL('https://gbf.wiki/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', raidName);
  url.searchParams.set('prop', 'wikitext|revid');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiPageUrl(raidName: string): string {
  const title = raidName.trim().replace(/\s+/g, '_');
  return `https://gbf.wiki/${encodeURIComponent(title).replace(/%2F/gi, '/')}`;
}

function parseItemReference(wikitext: string, itemName: string, sourceUrl: string, freshness?: string): WikiDropReference {
  const line = wikitext.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(itemName.toLowerCase()));
  if (!line) return unavailable(sourceUrl, 'No matching drop-table row was found on the public wiki page.', freshness);
  const rate = line.match(/(\d+(?:\.\d+)?)\s*%/);
  const qualitative = line.match(/\b(guaranteed|very common|common|uncommon|rare|very rare|extremely rare)\b/i);
  const chest = line.match(/\b(host|mvp|blue|red|gold|silver|wood|flip|share|crew|honor|honour)\s*(?:chest|box)?\b/i)?.[0];
  const sample = line.match(/(?:sample(?:\s*size)?|n)\s*[=:]\s*([\d,]+)/i)?.[1];
  const sampleSize = sample ? Number(sample.replace(/,/g, '')) : undefined;
  if (rate) {
    return {
      state: 'precise',
      ratePercent: Number(rate[1]),
      chest,
      sampleSize: Number.isFinite(sampleSize) ? sampleSize : undefined,
      freshness,
      sourceUrl,
    };
  }
  if (qualitative) {
    return {
      state: 'qualitative',
      label: qualitative[1],
      chest,
      sampleSize: Number.isFinite(sampleSize) ? sampleSize : undefined,
      freshness,
      sourceUrl,
      limitation: 'GBF Wiki exposes a qualitative label here; no precise percentage is inferred.',
    };
  }
  return unavailable(sourceUrl, 'A matching row exists, but no precise percentage or recognized qualitative rate was stated.', freshness, chest);
}

function unavailable(sourceUrl: string, limitation: string, freshness?: string, chest?: string): WikiDropReference {
  return { state: 'unavailable', sourceUrl, limitation, freshness, chest };
}
function isObject(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
