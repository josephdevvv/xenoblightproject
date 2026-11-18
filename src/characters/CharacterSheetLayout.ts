import type { Direction } from '../core/Direction';

/**
 * Sprite-sheet contract shared by production art and the mockup generator.
 *
 *   - Frame: 64 x 64 px, sheet 256 x 128 px (4 columns x 2 rows)
 *   - 8 STATIC directional frames (no idle / walk animation yet)
 *   - Frame order (verified against char_male_long_middle_part_blonde_adventurer):
 *       row 0:  S   SE  E   NE
 *       row 1:  N   NW  W   SW
 *   - Feet (ground contact point) at pixel (32, 58) of every frame
 *
 * When walk animation art arrives it will get its own clip layout here; until then characters
 * just switch to the static frame of their facing direction.
 */
export const CHARACTER_FRAME_WIDTH = 64;
export const CHARACTER_FRAME_HEIGHT = 64;
export const CHARACTER_SHEET_COLUMNS = 4;
export const CHARACTER_SHEET_ROWS = 2;

/** Frame index for each facing direction. */
export const CHARACTER_DIRECTION_FRAMES: Readonly<Record<Direction, number>> = {
  S: 0,
  SE: 1,
  E: 2,
  NE: 3,
  N: 4,
  NW: 5,
  W: 6,
  SW: 7,
};

/** Fallback origin (feet) for a frame that cannot be measured. Measured frames use SpriteMetrics. */
export const CHARACTER_ORIGIN = { x: 0.5, y: 58 / 64 } as const;

/**
 * On-screen height (world px at scale 1) every character figure is normalised to, measured on its
 * front (S) frame. Art from different sources draws characters at 38-56 px inside the 64x64 cell;
 * scaling each sheet to this height makes all appearances the same size. 54 px = the original
 * reference character, which therefore renders at exactly 1:1.
 */
export const CHARACTER_DISPLAY_HEIGHT = 54;

export function characterFrameIndex(direction: Direction): number {
  return CHARACTER_DIRECTION_FRAMES[direction];
}

/**
 * Walk-cycle sheet contract (optional, per appearance):
 *
 *   - Frame: 64 x 64 px, sheet 384 x 512 px (6 columns x 8 rows)
 *   - Each row is one direction, frames loop left to right
 *   - Row order (verified against char_male_long_middle_part_blonde_adventurer walk sheet):
 *       S, SE, E, NE, N, NW, W, SW
 *   - Feet (contact foot) at pixel y = 62 - the walk art stands lower in its frame than the
 *     standing art, so it gets its own origin to keep the feet on the same ground point.
 */
export const CHARACTER_WALK_LAYOUT = {
  columns: 6,
  frameRate: 8,
  rows: { S: 0, SE: 1, E: 2, NE: 3, N: 4, NW: 5, W: 6, SW: 7 } as Readonly<Record<Direction, number>>,
  origin: { x: 0.5, y: 62 / 64 },
} as const;
