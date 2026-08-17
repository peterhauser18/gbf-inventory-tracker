import { isVerifiedAccountResponseUrl } from '../account/ingest.ts';
import { isVerifiedCombatResponseUrl } from '../combat/multiraid.ts';
import type { CaptureResourceType } from './types.ts';

export type ObservedResponseRoute = 'account' | 'combat';

export function classifyObservedResponseUrl(url: string): ObservedResponseRoute | null {
  if (!isGbfGameOrigin(url)) return null;
  if (isVerifiedAccountResponseUrl(url)) return 'account';
  if (isVerifiedCombatResponseUrl(url)) return 'combat';
  return null;
}

export function shouldReadObservedResponse(url: string, resourceType: CaptureResourceType): boolean {
  if (resourceType === 'xhr' || resourceType === 'fetch') return classifyObservedResponseUrl(url) !== null;
  if (resourceType === 'document') return isVerifiedCombatResultDocument(url);
  return false;
}

function isVerifiedCombatResultDocument(url: string): boolean {
  if (!isGbfGameOrigin(url)) return false;
  try {
    return /^\/resultmulti\/content\/index\/[^/]+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isGbfGameOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'game.granbluefantasy.jp';
  } catch {
    return false;
  }
}
