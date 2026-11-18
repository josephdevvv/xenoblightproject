/**
 * Registry of production character sprite sheets: sprite ID -> URL (relative to /public).
 *
 * Appearances listed here use the real sheet; every other appearance falls back to a generated
 * mockup sheet with the same layout. To add art, drop the PNG at the path returned by
 * getCharacterSpritePath() and add an entry here. BootScene preloads every entry.
 * Sheets must follow CharacterSheetLayout (64x64 frames, 4 columns x 2 rows, 8 static directions).
 */
export const CHARACTER_SPRITE_MANIFEST: Readonly<Record<string, string>> = {
  char_male_long_middle_part_blonde_adventurer: 'assets/characters/male/long_middle_part/blonde_adventurer.png',
};
