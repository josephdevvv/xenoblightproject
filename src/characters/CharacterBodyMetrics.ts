import { SPRITE_FORGE_CHARACTER_VARIANTS } from '../assets/SpriteForgeCharacters';
import { walkSpriteIdOf } from './CharacterAssetIds';

/**
 * Body-based size normalisation.
 *
 * Sizing a sheet by its full figure height made hair change the body size: a taller hairstyle made
 * the whole character smaller (bald looked ~12 % larger than mohawk). Characters are now sized by
 * their BODY, which hair, hats or future outfits never change:
 *
 *   - Every approved Sprite Forge sprite is built on a body master (MALE_MASTER / FEMALE_MASTER).
 *     All variants of one master share the same body pixels below the head (legs, feet, torso), so
 *     they all get ONE scale, for static and walk sheets alike: legs and feet match exactly, and a
 *     character keeps its size when it starts / stops walking.
 *   - A master's body height = feet to the top of the bare head on its front (S) frame, measured on
 *     the master's bald sheet (no hair). tests/characterScale.test.ts re-measures the PNGs and fails
 *     if an export changes these numbers.
 *   - Sheets without a known master (none in use today) keep the previous rule: full figure height.
 */
export interface BodyMaster {
  /** Feet to top of the bare head on the front frame, in sheet pixels (64x64 frames). */
  bodyHeight: number;
  /** Sheet the height is measured on (bald = no hair), relative to /public. */
  referenceSheet: string;
}

export const BODY_MASTERS: Readonly<Record<string, BodyMaster>> = {
  MALE_MASTER: { bodyHeight: 49, referenceSheet: 'assets/characters/male/bald/base/male_bald_base_static_8dir.png' },
  FEMALE_MASTER: { bodyHeight: 49, referenceSheet: 'assets/characters/female/bald/base/female_bald_base_static_8dir.png' },
};

/**
 * On-screen body height (world px at scale 1). Chosen so the reference haired character - male
 * mohawk blonde drifter, 55 px tall with hair, 49 px body - keeps exactly the size it had before
 * (54 / 55 = x0.982). Bald and every other variant now match it.
 */
export const CHARACTER_BODY_DISPLAY_HEIGHT = (54 / 55) * 49;

/** Master of every approved sprite (static and walk keys, aliases included). */
const MASTER_BY_TEXTURE = new Map<string, string>();
for (const variant of SPRITE_FORGE_CHARACTER_VARIANTS) {
  const master = `${variant.appearance.gender.toUpperCase()}_MASTER`;
  for (const id of [variant.spriteId, ...variant.aliasSpriteIds]) {
    MASTER_BY_TEXTURE.set(id, master);
    MASTER_BY_TEXTURE.set(walkSpriteIdOf(id), master);
  }
}

export function bodyMasterOf(textureKey: string): string | null {
  return MASTER_BY_TEXTURE.get(textureKey) ?? null;
}

/**
 * Display multiplier for a sheet (static or walk) built on a known body master, or null when the
 * sheet has no master and must be sized by its own pixels.
 */
export function bodyNormalizeFor(textureKey: string): number | null {
  const master = bodyMasterOf(textureKey);
  const metrics = master ? BODY_MASTERS[master] : undefined;
  return metrics ? CHARACTER_BODY_DISPLAY_HEIGHT / metrics.bodyHeight : null;
}
