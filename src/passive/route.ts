import { isVerifiedAccountResponseUrl } from '../account/ingest.ts';
import { isVerifiedCombatResponseUrl } from '../combat/multiraid.ts';

export type PassiveResponseRoute = 'account' | 'combat';

export function classifyPassiveResponseUrl(url: string): PassiveResponseRoute | null {
  if (isVerifiedAccountResponseUrl(url)) return 'account';
  if (isVerifiedCombatResponseUrl(url)) return 'combat';
  return null;
}
