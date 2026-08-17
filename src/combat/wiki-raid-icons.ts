import { loadWikiMaterialThumbnails } from '../dashboard/wiki-assets.ts';
import { deferWikiImageUrl, installWikiImageDomLoader } from '../dashboard/wiki-image-loader.ts';
import { readObservedRaidBossIconDataUrl } from '../enemy-icon-cache.ts';

type RaidThumbnailLoader = (
  wikiTitles: readonly string[],
) => Promise<ReadonlyMap<string, string | undefined>>;
type LocalRaidIconLoader = (raidName: string) => Promise<string | undefined>;

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
  loadLocal: LocalRaidIconLoader = readObservedRaidBossIconDataUrl,
): Promise<string | undefined> {
  const trimmed = raidName.trim();
  if (!trimmed) return undefined;
  const local = await loadLocal(trimmed).catch(() => undefined);
  if (local) return local;

  const titles = wikiRaidPageTitles(trimmed);
  const thumbnails = await loadThumbnails(titles);
  const source = [...thumbnails.values()].find((value): value is string => Boolean(value));
  return deferWikiImageUrl(source);
}
