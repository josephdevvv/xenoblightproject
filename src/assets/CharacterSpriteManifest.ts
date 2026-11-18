/**
 * Registry of production character sprite sheets, keyed by sprite ID (see getCharacterSpriteId).
 *
 * Appearances listed here use the real art; every other appearance falls back to a generated
 * mockup standing sheet (and has no walk animation). BootScene preloads every URL.
 *
 *   standing: 4 x 2 static directional frames (CharacterSheetLayout)
 *   walk:     optional 6 x 8 walk cycle, one row per direction (CHARACTER_WALK_LAYOUT)
 *
 * URLs are relative to /public.
 */
export interface CharacterSpriteEntry {
  standing: string;
  walk?: string;
}

export const CHARACTER_SPRITE_MANIFEST: Readonly<Record<string, CharacterSpriteEntry>> = {
  char_male_long_middle_part_blonde_adventurer: {
    standing: 'assets/characters/male/long_middle_part/blonde_adventurer.png',
    walk: 'assets/characters/male/long_middle_part/blonde_adventurer_walk.png',
  },
};
