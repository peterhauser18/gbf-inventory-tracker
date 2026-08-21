import { isVerifiedAccountResponseUrl } from '../account/ingest.ts';
import { isVerifiedCombatResponseUrl } from '../combat/complete-observation.ts';
import { isVerifiedPartyDeckResponseUrl } from '../combat/loadout.ts';
import { isVerifiedWeaponStashMetadataResponseUrl } from './stash-metadata.ts';
import type { CaptureResourceType } from './types.ts';

export type ObservedResponseRoute = 'account' | 'combat' | 'loadout' | 'stash-meta';

export function classifyObservedResponseUrl(url: string): ObservedResponseRoute | null {
  if (!isGbfGameOrigin(url)) return null;
  if (isVerifiedAccountResponseUrl(url)) return 'account';
  if (isVerifiedCombatResponseUrl(url)) return 'combat';
  if (isVerifiedPartyDeckResponseUrl(url)) return 'loadout';
  if (isVerifiedWeaponStashMetadataResponseUrl(url)) return 'stash-meta';
  return null;
}

export function shouldReadObservedResponse(url: string, resourceType: CaptureResourceType): boolean {
  if (resourceType !== 'xhr' && resourceType !== 'fetch') return false;
  return classifyObservedResponseUrl(url) !== null;
}

function isGbfGameOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'game.granbluefantasy.jp';
  } catch {
    return false;
  }
}
