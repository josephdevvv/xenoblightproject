import type { CharacterAppearance } from '../data/CharacterData';

/**
 * Every appearance combination maps to exactly one complete, pre-rendered sprite sheet.
 * (2 genders x 6 hairstyles x 5 hair colours x 2 outfits = 120 sheets when the art is finished.)
 *
 * The ID doubles as the Phaser texture key.
 */
export function getCharacterSpriteId(a: CharacterAppearance): string {
  return `char_${a.gender}_${a.hairstyleId}_${a.hairColorId}_${a.outfitId}`;
}

/** Where the final sprite sheet for an appearance is expected to live (relative to /public). */
export function getCharacterSpritePath(a: CharacterAppearance): string {
  return `assets/characters/${a.gender}/${a.hairstyleId}/${a.hairColorId}_${a.outfitId}.png`;
}
