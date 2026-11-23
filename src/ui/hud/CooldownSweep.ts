import type { Point } from '../../core/types';

/**
 * Hotbar cooldown sweep - pure, unit-tested. A clock hand starts at 12 o'clock and turns CLOCKWISE as the cooldown
 * runs out: the part already passed shows the icon again, the part still to come stays gray. Built from the real
 * remaining / total time, never from a timer of its own.
 */

/** Steps in a full turn: the sweep is redrawn only when it moves a whole step (4 degrees). */
export const SWEEP_STEPS = 90;

/** How much of the cooldown has passed (0 = just started, 1 = ready). */
export function elapsedFraction(remainingMs: number, totalMs: number): number {
  if (!(totalMs > 0) || !(remainingMs > 0)) return 1;
  return Math.min(1, Math.max(0, 1 - remainingMs / totalMs));
}

/** The whole step the sweep is on (what decides a redraw). */
export function sweepStep(remainingMs: number, totalMs: number): number {
  return Math.floor(elapsedFraction(remainingMs, totalMs) * SWEEP_STEPS);
}

/** Seconds shown on the slot (rounded up, never 0 while cooling down). */
export function cooldownSeconds(remainingMs: number): number {
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

/** Angle of the clock hand (radians, screen space: 0 = 3 o'clock, y down, so increasing = clockwise). */
export function handAngle(elapsed: number): number {
  return -Math.PI / 2 + elapsed * Math.PI * 2;
}

/**
 * The still-gray part as a polygon: the centre, then the arc from the hand CLOCKWISE round to 12 o'clock.
 * Empty when the cooldown is over.
 */
export function remainingWedge(center: Point, radius: number, elapsed: number): Point[] {
  if (elapsed >= 1) return [];
  const start = handAngle(elapsed);
  const end = -Math.PI / 2 + Math.PI * 2;
  const segments = Math.max(2, Math.ceil(((end - start) / (Math.PI * 2)) * 48));
  const points: Point[] = [{ x: center.x, y: center.y }];
  for (let i = 0; i <= segments; i++) {
    const a = start + ((end - start) * i) / segments;
    points.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return points;
}
