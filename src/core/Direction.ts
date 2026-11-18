import type { Point } from './types';

/**
 * The eight facing directions, in sprite-sheet row order.
 * Directions are SCREEN directions: N = up on screen, E = right on screen.
 */
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Future combat / action animations (attack, cast, pick-up, death) only use the diagonals. */
export const ACTION_DIRECTIONS = ['NE', 'SE', 'SW', 'NW'] as const satisfies readonly Direction[];

const SCREEN_INPUT_TO_DIRECTION: Record<string, Direction> = {
  '0,-1': 'N',
  '1,-1': 'NE',
  '1,0': 'E',
  '1,1': 'SE',
  '0,1': 'S',
  '-1,1': 'SW',
  '-1,0': 'W',
  '-1,-1': 'NW',
};

/**
 * Maps a digital screen-space input (x: -1 left .. 1 right, y: -1 up .. 1 down)
 * to one of the eight directions, or null when there is no input.
 */
export function directionFromScreenInput(x: number, y: number): Direction | null {
  return SCREEN_INPUT_TO_DIRECTION[`${Math.sign(x)},${Math.sign(y)}`] ?? null;
}

/**
 * Converts a screen-space input into a unit vector in GROUND (tile) space.
 *
 * In a 2:1 isometric projection, "screen up" is the tile-space vector (-1, -1),
 * "screen right" is (1, -1) and the key diagonals (e.g. W+D) run along a single tile axis.
 * Normalising in ground space keeps the walking speed identical in all eight directions
 * (diagonal speed normalisation), even though screen-space pixel speed differs per direction.
 */
export function screenInputToGroundVector(x: number, y: number): Point {
  const gx = Math.sign(x) + Math.sign(y);
  const gy = Math.sign(y) - Math.sign(x);
  const length = Math.hypot(gx, gy);
  return length === 0 ? { x: 0, y: 0 } : { x: gx / length, y: gy / length };
}
