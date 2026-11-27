import healGreen from '../../../public/assets/vfx/shared/heal_green/heal_green_metadata.json';
import { CHARACTER_CANVAS_ROOT } from '../../characters/CharacterSheetLayout';

/**
 * The shared HP-healing VFX (pure, unit-tested), read from the approved Sprite Forge VFX in public/assets (the two
 * sheets and the metadata copied unchanged from approved/vfx/heal_green/ - their sha256 is in the metadata).
 *
 * heal_green: 8 frames of 64 x 80, one set for every direction, gender, hairstyle, outfit and class, in TWO layers -
 * `behind` (aura and ground ring, drawn under the character) and `front` (rising streaks, motes, the peak glint,
 * drawn over it). Its feet anchor (32, 72) goes on the healed character's feet. For every HP healing skill - never for
 * potions, consumables, regeneration or the respawn.
 */
export type HealVfxLayerId = 'behind' | 'front';
export const HEAL_VFX_LAYERS: readonly HealVfxLayerId[] = ['behind', 'front'];

const BASE = 'assets/vfx/shared/heal_green/';

export const HEAL_GREEN = {
  id: healGreen.id,
  frameWidth: healGreen.sheetLayout.frameWidth,
  frameHeight: healGreen.sheetLayout.frameHeight,
  frames: healGreen.frameCount,
  frameDurationsMs: healGreen.frameDurationsMs as readonly number[],
  loop: healGreen.loop,
  /** The canvas point that goes on the healed character's feet. */
  anchor: { x: healGreen.anchor.x, y: healGreen.anchor.y },
  /** Sprite origin (0..1) for that anchor. */
  origin: { x: healGreen.anchor.x / healGreen.sheetLayout.frameWidth, y: healGreen.anchor.y / healGreen.sheetLayout.frameHeight },
  /** 1-based frame of the peak (lined up with a cast clip's cast frame). */
  peakFrame: healGreen.attach.timing.vfxPeakFrame,
  /** The feet of a 64 x 64 character frame (every character sheet shares that canvas). */
  characterFeet: { x: healGreen.attach.characterFeet.x, y: healGreen.attach.characterFeet.y },
  layers: {
    behind: { key: 'vfx.heal_green.behind', animKey: 'vfx.heal_green.behind.play', url: BASE + healGreen.layers.behind.sheet, sha256: healGreen.sheetSha256.behind },
    front: { key: 'vfx.heal_green.front', animKey: 'vfx.heal_green.front.play', url: BASE + healGreen.layers.front.sheet, sha256: healGreen.sheetSha256.front },
  },
} as const;

/** The whole effect at its authored speed (ms). */
export const HEAL_GREEN_DURATION_MS = HEAL_GREEN.frameDurationsMs.reduce((s, ms) => s + ms, 0);

/**
 * When the effect starts after the heal resolved: with a cast clip, so that its peak frame shows on the clip's cast
 * frame (Self-Heal: cast frame 5, peak F4 -> one clip frame in); without one (no clip plays), at the heal event.
 */
export function healVfxDelayMs(cast: { castFrame: number; frameMs: number } | null): number {
  if (!cast) return 0;
  return Math.max(0, cast.castFrame - HEAL_GREEN.peakFrame) * cast.frameMs;
}

/**
 * Where the effect's anchor goes for a character sprite: its feet. A character sprite sits on its canvas root
 * (CHARACTER_CANVAS_ROOT) at `scale`; the forge puts the feet at `characterFeet` of the same canvas.
 */
export function characterFeetOffset(scaleX: number, scaleY: number): { x: number; y: number } {
  return { x: (HEAL_GREEN.characterFeet.x - CHARACTER_CANVAS_ROOT.x) * scaleX, y: (HEAL_GREEN.characterFeet.y - CHARACTER_CANVAS_ROOT.y) * scaleY };
}
