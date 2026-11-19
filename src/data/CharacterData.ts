import { createInitialStatus, type CharacterStatus } from '../status/StatTypes';
import type { Gender } from './AppearanceCatalog';

/**
 * Appearance selections. These are IDs only; how they are drawn is decided by the
 * sprite asset resolved from them (one complete pre-rendered sheet per combination).
 */
export interface CharacterAppearance {
  gender: Gender;
  hairstyleId: string;
  hairColorId: string;
  outfitId: string;
}

export interface CharacterData {
  id: string;
  name: string;
  appearance: CharacterAppearance;
  createdAt: number;
  /** Level, main stats and stat points. Loaded/saved by CharacterStatusService. */
  status: CharacterStatus;
}

export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 16;

/** Letters (any script, incl. Thai combining marks) and digits, single spaces between words. */
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}]+(?: [\p{L}\p{M}\p{N}]+)*$/u;

export type NameValidationResult = { valid: true; name: string } | { valid: false; error: string };

export function validateCharacterName(raw: string): NameValidationResult {
  const name = raw.trim();
  const length = [...name].length;

  if (length === 0) {
    return { valid: false, error: 'Please enter a character name.' };
  }
  if (length < NAME_MIN_LENGTH) {
    return { valid: false, error: `Name must be at least ${NAME_MIN_LENGTH} characters.` };
  }
  if (length > NAME_MAX_LENGTH) {
    return { valid: false, error: `Name must be at most ${NAME_MAX_LENGTH} characters.` };
  }
  if (!NAME_PATTERN.test(name)) {
    return { valid: false, error: 'Letters, numbers and single spaces only.' };
  }
  return { valid: true, name };
}

/** Default look: the first appearance with production art (char_male_long_middle_part_blonde_adventurer). */
const DEFAULT_APPEARANCE: Readonly<CharacterAppearance> = {
  gender: 'male',
  hairstyleId: 'long_middle_part',
  hairColorId: 'blonde',
  outfitId: 'adventurer',
};

export function createDefaultAppearance(): CharacterAppearance {
  return { ...DEFAULT_APPEARANCE };
}

export function createCharacterData(name: string, appearance: CharacterAppearance): CharacterData {
  const random = Math.random().toString(36).slice(2, 8);
  return {
    id: `char_${Date.now().toString(36)}_${random}`,
    name,
    appearance: { ...appearance },
    createdAt: Date.now(),
    status: createInitialStatus(),
  };
}
