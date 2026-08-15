const WIKI_ORIGIN = 'https://gbf.wiki';
const DEFAULT_SAFE_IMAGE_HOSTS = new Set(['gbf.wiki']);
const DENIED_IMAGE_HOST_SUFFIXES = [
  'game.granbluefantasy.jp',
  'granbluefantasy.jp',
  'akamaized.net',
  'mizagbf.github.io',
];

export interface WikiResolutionInput {
  wikiTitle?: string;
  displayName?: string;
  publicId?: string;
}

export function resolveWikiUrl(input: WikiResolutionInput): string {
  if (input.wikiTitle) return wikiPageUrl(input.wikiTitle);
  const query = input.displayName?.trim() || input.publicId?.trim() || 'Granblue Fantasy';
  const url = new URL('/index.php', WIKI_ORIGIN);
  url.searchParams.set('search', query);
  return url.toString();
}

export function wikiPageUrl(title: string): string {
  const normalized = title.trim().replaceAll(' ', '_');
  return `${WIKI_ORIGIN}/${encodeURIComponent(normalized).replaceAll('%2F', '/')}`;
}

export function resolveSafeExternalImageUrl(
  candidate: string | undefined,
  allowedHosts: ReadonlySet<string> = DEFAULT_SAFE_IMAGE_HOSTS,
): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (DENIED_IMAGE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
    return allowedHosts.has(host) ? url.toString() : null;
  } catch {
    return null;
  }
}
