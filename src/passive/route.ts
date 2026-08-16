import { isVerifiedAccountResponseUrl } from '../account/ingest.ts';
import { isVerifiedCombatResponseUrl } from '../combat/multiraid.ts';

export type PassiveResponseRoute = 'account' | 'combat';

export function classifyPassiveResponseUrl(url: string): PassiveResponseRoute | null {
  if (!isGbfGameOrigin(url)) return null;
  if (isVerifiedAccountResponseUrl(url)) return 'account';
  if (isVerifiedCombatResponseUrl(url)) return 'combat';
  return null;
}

function isGbfGameOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'game.granbluefantasy.jp';
  } catch {
    return false;
  }
}
