/**
 * Registry of production character sprite sheets, keyed by sprite ID (see getCharacterSpriteId).
 *
 * Only APPROVED art exported from Xenoblight Sprite Forge is registered (src/assets/SpriteForgeCharacters.ts,
 * files under public/assets/characters/). The earlier imported sheets were removed from the project, so
 * their entries are gone too. Nothing here is loaded at startup: AssetManager loads an entry on demand
 * when a scene shows that appearance. URLs are relative to /public.
 *
 *   standing:  4 x 2 static directional frames, 64 x 64 (CharacterSheetLayout).
 *   walk:      6 x 8 walk cycle, 64 x 64, rows S SE E NE N NW W SW, 125 ms per frame (CHARACTER_WALK_LAYOUT).
 *   (Feet position and figure height are measured from the pixels at runtime - SpriteMetrics.)
 *
 * Character creation only offers the four Drifter starters (StarterCharacters.ts); the "basic" (no
 * outfit) sheets stay registered for later features.
 */
import { SPRITE_FORGE_SPRITE_ENTRIES } from './SpriteForgeCharacters';

export interface CharacterSpriteEntry {
  standing: string;
  walk?: string;
}

export const CHARACTER_SPRITE_MANIFEST: Readonly<Record<string, CharacterSpriteEntry>> = {
  ...SPRITE_FORGE_SPRITE_ENTRIES,
};

/** Approved art must never be silently replaced by a generated mockup. */
export function isApprovedCharacterSprite(spriteId: string): boolean {
  return spriteId in SPRITE_FORGE_SPRITE_ENTRIES;
}
