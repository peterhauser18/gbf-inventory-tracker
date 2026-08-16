import {
  parseWikiObtainRaidSources,
  unavailableWikiSources,
  type WikiMaterialRaidSources,
} from './farming.ts';

export interface WikiMaterialSourceFetchOptions {
  fetchImpl?: typeof fetch;
}

export async function loadWikiMaterialRaidSources(
  wikiTitle: string,
  options: WikiMaterialSourceFetchOptions = {},
): Promise<WikiMaterialRaidSources> {
  const title = wikiTitle.trim();
  const sourceUrl = buildWikiMaterialPageUrl(title);
  if (!title) return unavailableWikiSources(title, sourceUrl, 'No Wiki title is available for this material.');

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(buildWikiMaterialApiUrl(title), {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return unavailableWikiSources(title, sourceUrl, `GBF Wiki request failed: ${response.status}.`);
    const payload = await response.json() as unknown;
    if (!isObject(payload) || !isObject(payload.parse)) {
      return unavailableWikiSources(title, sourceUrl, 'No structured Wiki page data was returned.');
    }
    const revisionId = numberValue(payload.parse.revid);
    const freshness = revisionId === undefined ? undefined : `revision ${revisionId}`;
    const wikitextObject = isObject(payload.parse.wikitext) ? payload.parse.wikitext : undefined;
    const wikitext = typeof wikitextObject?.['*'] === 'string' ? wikitextObject['*'] : undefined;
    if (!wikitext) {
      return unavailableWikiSources(title, sourceUrl, 'The Wiki page did not expose wikitext for source parsing.', freshness);
    }
    return parseWikiObtainRaidSources(wikitext, title, sourceUrl, freshness);
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    return unavailableWikiSources(title, sourceUrl, `GBF Wiki lookup failed.${detail}`.trim());
  }
}

export function buildWikiMaterialApiUrl(wikiTitle: string): string {
  const url = new URL('https://gbf.wiki/api.php');
  url.searchParams.set('action', 'parse');
  url.searchParams.set('page', wikiTitle);
  url.searchParams.set('prop', 'wikitext|revid');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  return url.toString();
}

export function buildWikiMaterialPageUrl(wikiTitle: string): string {
  return `https://gbf.wiki/${encodeURIComponent(wikiTitle.trim().replace(/\s+/g, '_')).replace(/%2F/gi, '/')}`;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
