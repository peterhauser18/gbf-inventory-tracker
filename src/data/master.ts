export type SpecialCharacterKind = 'eternal' | 'evoker';

export interface SpecialCharacterMaster {
  kind: SpecialCharacterKind;
  masterId: string;
  name: string;
  wikiTitle: string;
  goalId: string;
}

export const ETERNALS: readonly SpecialCharacterMaster[] = [
  { kind: 'eternal', masterId: '3040030000', name: 'Anre', wikiTitle: 'Anre', goalId: 'eternal-anre-5star' },
  { kind: 'eternal', masterId: '3040031000', name: 'Tweyen', wikiTitle: 'Tweyen', goalId: 'eternal-tweyen-5star' },
  { kind: 'eternal', masterId: '3040032000', name: 'Threo', wikiTitle: 'Threo', goalId: 'eternal-threo-5star' },
  { kind: 'eternal', masterId: '3040033000', name: 'Feower', wikiTitle: 'Feower', goalId: 'eternal-feower-5star' },
  { kind: 'eternal', masterId: '3040034000', name: 'Fif', wikiTitle: 'Fif', goalId: 'eternal-fif-5star' },
  { kind: 'eternal', masterId: '3040035000', name: 'Seox', wikiTitle: 'Seox', goalId: 'eternal-seox-5star' },
  { kind: 'eternal', masterId: '3040036000', name: 'Seofon', wikiTitle: 'Seofon', goalId: 'eternal-seofon-5star' },
  { kind: 'eternal', masterId: '3040037000', name: 'Eahta', wikiTitle: 'Eahta', goalId: 'eternal-eahta-5star' },
  { kind: 'eternal', masterId: '3040038000', name: 'Niyon', wikiTitle: 'Niyon', goalId: 'eternal-niyon-5star' },
  { kind: 'eternal', masterId: '3040039000', name: 'Tien', wikiTitle: 'Tien', goalId: 'eternal-tien-5star' },
] as const;

export const EVOKERS: readonly SpecialCharacterMaster[] = [
  { kind: 'evoker', masterId: '3040160000', name: 'Maria Theresa', wikiTitle: 'Maria Theresa', goalId: 'evoker-maria-5star' },
  { kind: 'evoker', masterId: '3040161000', name: 'Fraux', wikiTitle: 'Fraux', goalId: 'evoker-fraux-5star' },
  { kind: 'evoker', masterId: '3040162000', name: 'Geisenborger', wikiTitle: 'Geisenborger', goalId: 'evoker-geisenborger-5star' },
  { kind: 'evoker', masterId: '3040163000', name: 'Estarriola', wikiTitle: 'Estarriola', goalId: 'evoker-estarriola-5star' },
  { kind: 'evoker', masterId: '3040164000', name: 'Caim', wikiTitle: 'Caim', goalId: 'evoker-caim-5star' },
  { kind: 'evoker', masterId: '3040165000', name: 'Lobelia', wikiTitle: 'Lobelia', goalId: 'evoker-lobelia-5star' },
  { kind: 'evoker', masterId: '3040166000', name: 'Katzelia', wikiTitle: 'Katzelia', goalId: 'evoker-katzelia-5star' },
  { kind: 'evoker', masterId: '3040167000', name: 'Alanaan', wikiTitle: 'Alanaan', goalId: 'evoker-alanaan-5star' },
  { kind: 'evoker', masterId: '3040168000', name: 'Haaselia', wikiTitle: 'Haaselia', goalId: 'evoker-haaselia-5star' },
  { kind: 'evoker', masterId: '3040169000', name: 'Nier', wikiTitle: 'Nier', goalId: 'evoker-nier-5star' },
] as const;

const SPECIAL_BY_MASTER_ID = new Map(
  [...ETERNALS, ...EVOKERS].map((entry) => [entry.masterId, entry]),
);

export function findSpecialCharacter(masterId: string): SpecialCharacterMaster | undefined {
  return SPECIAL_BY_MASTER_ID.get(masterId);
}
