import { restoreCharacterData, type CharacterData } from '../data/CharacterData';
import { CharacterStatusService } from '../status/CharacterStatusService';
import type { GameSave } from './SaveFile';

/**
 * Turns a checked save file into a character for this session. Save files are the only source of kept progress:
 * nothing is looked up in or written to the browser, and the character is independent of any other with the
 * same name.
 */
export const SaveService = {
  restore(save: GameSave): CharacterData {
    if (save.repaired.length > 0) console.warn(`[save] repaired while loading "${save.profile.name}":`, save.repaired);
    const character = restoreCharacterData(save.profile);
    CharacterStatusService.restore(character, save);
    return character;
  },
};
