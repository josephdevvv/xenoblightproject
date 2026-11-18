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

/** Origin that places the character's feet on its world position. */
export const CHARACTER_ORIGIN = { x: 0.5, y: 58 / 64 } as const;

export function characterFrameIndex(direction: Direction): number {
  return CHARACTER_DIRECTION_FRAMES[direction];
}
