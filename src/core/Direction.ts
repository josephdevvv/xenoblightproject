import type { Point } from './types';

/**
 * The eight facing directions, in sprite-sheet row order.
 * Directions are SCREEN directions: N = up on screen, E = right on screen.
 */
export const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Future combat / action animations (attack, cast, pick-up, death) only use the diagonals. */
export const ACTION_DIRECTIONS = ['NE', 'SE', 'SW', 'NW'] as const satisfies readonly Direction[];
export type ActionDirection = (typeof ACTION_DIRECTIONS)[number];

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

/** Screen-space direction of a ground (tile-space) vector (2:1 isometric: x = dx - dy, y = (dx + dy) / 2). */
function groundToScreen(gx: number, gy: number): Point {
  return { x: gx - gy, y: (gx + gy) / 2 };
}

/** The 8-way facing for a movement / look direction given in GROUND (tile) space, or null for zero. */
export function directionFromGroundVector(gx: number, gy: number): Direction | null {
  const s = groundToScreen(gx, gy);
  if (Math.abs(s.x) < 1e-9 && Math.abs(s.y) < 1e-9) return null;
  // screen angle in 45-degree sectors, 0 = E, clockwise (screen y points down)
  const sector = ((Math.round(Math.atan2(s.y, s.x) / (Math.PI / 4)) % 8) + 8) % 8;
  return (['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const)[sector];
}

/**
 * The 4-way action facing (attack / hit / cast / death art: SE, SW, NE, NW) for a GROUND vector. A pure
 * screen-vertical / horizontal direction keeps the side of `fallback`.
 */
export function actionDirectionFromGroundVector(gx: number, gy: number, fallback: ActionDirection = 'SE'): ActionDirection {
  const s = groundToScreen(gx, gy);
  const east = Math.abs(s.x) < 1e-9 ? fallback === 'SE' || fallback === 'NE' : s.x > 0;
  const south = Math.abs(s.y) < 1e-9 ? fallback === 'SE' || fallback === 'SW' : s.y > 0;
  return south ? (east ? 'SE' : 'SW') : east ? 'NE' : 'NW';
}
