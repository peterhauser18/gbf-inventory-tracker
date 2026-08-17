import { loadWikiMaterialThumbnails } from '../dashboard/wiki-assets.ts';
import { deferWikiImageUrl, installWikiImageDomLoader } from '../dashboard/wiki-image-loader.ts';

type RaidThumbnailLoader = (
  wikiTitles: readonly string[],
) => Promise<ReadonlyMap<string, string | undefined>>;

installWikiImageDomLoader();

export function wikiRaidPageTitles(raidName: string): string[] {
  const trimmed = raidName.trim();
  if (!trimmed) return [];
  if (/\(Raid\)$/i.test(trimmed)) return [trimmed];
  return [`${trimmed} (Raid)`, trimmed];
}

export async function resolveWikiRaidIcon(
  raidName: string,
  loadThumbnails: RaidThumbnailLoader = loadWikiMaterialThumbnails,
): Promise<string | undefined> {
  const titles = wikiRaidPageTitles(raidName);
  if (titles.length === 0) return undefined;
  const thumbnails = await loadThumbnails(titles);
  const source = [...thumbnails.values()].find((value): value is string => Boolean(value));
  return deferWikiImageUrl(source);
}
