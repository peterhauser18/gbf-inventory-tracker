export type SpecialCharacterKind = 'eternal' | 'evoker';

export interface SpecialCharacterMaster {
  kind: SpecialCharacterKind;
  masterId: string;
  name: string;
  wikiTitle: string;
  goalId: string;
  uncapGoalIds?: readonly string[];
  transcendenceGoalIds?: readonly string[];
}

export const ETERNALS: readonly SpecialCharacterMaster[] = [
  { kind: 'eternal', masterId: '3040030000', name: 'Anre', wikiTitle: 'Anre', goalId: 'eternal-anre-5star', uncapGoalIds: ['eternal-anre-1star', 'eternal-anre-2star', 'eternal-anre-3star', 'eternal-anre-4star', 'eternal-anre-5star'], transcendenceGoalIds: ['eternal-anre-transcendence-1', 'eternal-anre-transcendence-2', 'eternal-anre-transcendence-3', 'eternal-anre-transcendence-4', 'eternal-anre-transcendence-5'] },
  { kind: 'eternal', masterId: '3040031000', name: 'Tweyen', wikiTitle: 'Tweyen', goalId: 'eternal-tweyen-5star', uncapGoalIds: ['eternal-tweyen-1star', 'eternal-tweyen-2star', 'eternal-tweyen-3star', 'eternal-tweyen-4star', 'eternal-tweyen-5star'], transcendenceGoalIds: ['eternal-tweyen-transcendence-1', 'eternal-tweyen-transcendence-2', 'eternal-tweyen-transcendence-3', 'eternal-tweyen-transcendence-4', 'eternal-tweyen-transcendence-5'] },
  { kind: 'eternal', masterId: '3040032000', name: 'Threo', wikiTitle: 'Threo', goalId: 'eternal-threo-5star', uncapGoalIds: ['eternal-threo-1star', 'eternal-threo-2star', 'eternal-threo-3star', 'eternal-threo-4star', 'eternal-threo-5star'], transcendenceGoalIds: ['eternal-threo-transcendence-1', 'eternal-threo-transcendence-2', 'eternal-threo-transcendence-3', 'eternal-threo-transcendence-4', 'eternal-threo-transcendence-5'] },
  { kind: 'eternal', masterId: '3040033000', name: 'Feower', wikiTitle: 'Feower', goalId: 'eternal-feower-5star', uncapGoalIds: ['eternal-feower-1star', 'eternal-feower-2star', 'eternal-feower-3star', 'eternal-feower-4star', 'eternal-feower-5star'], transcendenceGoalIds: ['eternal-feower-transcendence-1', 'eternal-feower-transcendence-2', 'eternal-feower-transcendence-3', 'eternal-feower-transcendence-4', 'eternal-feower-transcendence-5'] },
  { kind: 'eternal', masterId: '3040034000', name: 'Fif', wikiTitle: 'Fif', goalId: 'eternal-fif-5star', uncapGoalIds: ['eternal-fif-1star', 'eternal-fif-2star', 'eternal-fif-3star', 'eternal-fif-4star', 'eternal-fif-5star'], transcendenceGoalIds: ['eternal-fif-transcendence-1', 'eternal-fif-transcendence-2', 'eternal-fif-transcendence-3', 'eternal-fif-transcendence-4', 'eternal-fif-transcendence-5'] },
  { kind: 'eternal', masterId: '3040035000', name: 'Seox', wikiTitle: 'Seox', goalId: 'eternal-seox-5star', uncapGoalIds: ['eternal-seox-1star', 'eternal-seox-2star', 'eternal-seox-3star', 'eternal-seox-4star', 'eternal-seox-5star'], transcendenceGoalIds: ['eternal-seox-transcendence-1', 'eternal-seox-transcendence-2', 'eternal-seox-transcendence-3', 'eternal-seox-transcendence-4', 'eternal-seox-transcendence-5'] },
  { kind: 'eternal', masterId: '3040036000', name: 'Seofon', wikiTitle: 'Seofon', goalId: 'eternal-seofon-5star', uncapGoalIds: ['eternal-seofon-1star', 'eternal-seofon-2star', 'eternal-seofon-3star', 'eternal-seofon-4star', 'eternal-seofon-5star'], transcendenceGoalIds: ['eternal-seofon-transcendence-1', 'eternal-seofon-transcendence-2', 'eternal-seofon-transcendence-3', 'eternal-seofon-transcendence-4', 'eternal-seofon-transcendence-5'] },
  { kind: 'eternal', masterId: '3040037000', name: 'Eahta', wikiTitle: 'Eahta', goalId: 'eternal-eahta-5star', uncapGoalIds: ['eternal-eahta-1star', 'eternal-eahta-2star', 'eternal-eahta-3star', 'eternal-eahta-4star', 'eternal-eahta-5star'], transcendenceGoalIds: ['eternal-eahta-transcendence-1', 'eternal-eahta-transcendence-2', 'eternal-eahta-transcendence-3', 'eternal-eahta-transcendence-4', 'eternal-eahta-transcendence-5'] },
  { kind: 'eternal', masterId: '3040038000', name: 'Niyon', wikiTitle: 'Niyon', goalId: 'eternal-niyon-5star', uncapGoalIds: ['eternal-niyon-1star', 'eternal-niyon-2star', 'eternal-niyon-3star', 'eternal-niyon-4star', 'eternal-niyon-5star'], transcendenceGoalIds: ['eternal-niyon-transcendence-1', 'eternal-niyon-transcendence-2', 'eternal-niyon-transcendence-3', 'eternal-niyon-transcendence-4', 'eternal-niyon-transcendence-5'] },
  { kind: 'eternal', masterId: '3040039000', name: 'Tien', wikiTitle: 'Tien', goalId: 'eternal-tien-5star', uncapGoalIds: ['eternal-tien-1star', 'eternal-tien-2star', 'eternal-tien-3star', 'eternal-tien-4star', 'eternal-tien-5star'], transcendenceGoalIds: ['eternal-tien-transcendence-1', 'eternal-tien-transcendence-2', 'eternal-tien-transcendence-3', 'eternal-tien-transcendence-4', 'eternal-tien-transcendence-5'] },
] as const;

export const EVOKERS: readonly SpecialCharacterMaster[] = [
  { kind: 'evoker', masterId: '3040160000', name: 'Maria Theresa', wikiTitle: 'Maria Theresa', goalId: 'evoker-maria-5star', uncapGoalIds: ['evoker-maria-1star', 'evoker-maria-2star', 'evoker-maria-3star', 'evoker-maria-4star', 'evoker-maria-5star'], transcendenceGoalIds: ['evoker-maria-transcendence-1'] },
  { kind: 'evoker', masterId: '3040161000', name: 'Fraux', wikiTitle: 'Fraux', goalId: 'evoker-fraux-5star', uncapGoalIds: ['evoker-fraux-1star', 'evoker-fraux-2star', 'evoker-fraux-3star', 'evoker-fraux-4star', 'evoker-fraux-5star'] },
  { kind: 'evoker', masterId: '3040162000', name: 'Geisenborger', wikiTitle: 'Geisenborger', goalId: 'evoker-geisenborger-5star', uncapGoalIds: ['evoker-geisenborger-1star', 'evoker-geisenborger-2star', 'evoker-geisenborger-3star', 'evoker-geisenborger-4star', 'evoker-geisenborger-5star'] },
  { kind: 'evoker', masterId: '3040163000', name: 'Estarriola', wikiTitle: 'Estarriola', goalId: 'evoker-estarriola-5star', uncapGoalIds: ['evoker-estarriola-1star', 'evoker-estarriola-2star', 'evoker-estarriola-3star', 'evoker-estarriola-4star', 'evoker-estarriola-5star'] },
  { kind: 'evoker', masterId: '3040164000', name: 'Caim', wikiTitle: 'Caim', goalId: 'evoker-caim-5star', uncapGoalIds: ['evoker-caim-1star', 'evoker-caim-2star', 'evoker-caim-3star', 'evoker-caim-4star', 'evoker-caim-5star'], transcendenceGoalIds: ['evoker-caim-transcendence-1'] },
  { kind: 'evoker', masterId: '3040165000', name: 'Lobelia', wikiTitle: 'Lobelia', goalId: 'evoker-lobelia-5star', uncapGoalIds: ['evoker-lobelia-1star', 'evoker-lobelia-2star', 'evoker-lobelia-3star', 'evoker-lobelia-4star', 'evoker-lobelia-5star'] },
  { kind: 'evoker', masterId: '3040166000', name: 'Katzelia', wikiTitle: 'Katzelia', goalId: 'evoker-katzelia-5star', uncapGoalIds: ['evoker-katzelia-1star', 'evoker-katzelia-2star', 'evoker-katzelia-3star', 'evoker-katzelia-4star', 'evoker-katzelia-5star'] },
  { kind: 'evoker', masterId: '3040167000', name: 'Alanaan', wikiTitle: 'Alanaan', goalId: 'evoker-alanaan-5star', uncapGoalIds: ['evoker-alanaan-1star', 'evoker-alanaan-2star', 'evoker-alanaan-3star', 'evoker-alanaan-4star', 'evoker-alanaan-5star'] },
  { kind: 'evoker', masterId: '3040168000', name: 'Haaselia', wikiTitle: 'Haaselia', goalId: 'evoker-haaselia-5star', uncapGoalIds: ['evoker-haaselia-1star', 'evoker-haaselia-2star', 'evoker-haaselia-3star', 'evoker-haaselia-4star', 'evoker-haaselia-5star'] },
  { kind: 'evoker', masterId: '3040169000', name: 'Nier', wikiTitle: 'Nier', goalId: 'evoker-nier-5star', uncapGoalIds: ['evoker-nier-1star', 'evoker-nier-2star', 'evoker-nier-3star', 'evoker-nier-4star', 'evoker-nier-5star'] },
] as const;

const SPECIAL_BY_MASTER_ID = new Map(
  [...ETERNALS, ...EVOKERS].map((entry) => [entry.masterId, entry]),
);

export function findSpecialCharacter(masterId: string): SpecialCharacterMaster | undefined {
  return SPECIAL_BY_MASTER_ID.get(masterId);
}
