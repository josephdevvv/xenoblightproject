import type { Point } from '../core/types';

/**
 * Mobile targeting (pure, unit-tested). There is no pointer to hover or click monsters with, so the nearest valid
 * monster within 3 tiles is selected by itself; the sword button attacks it by the normal combat rules.
 *
 *  - a monster being fought (the combat target - the sword, a tap on it, Auto Play) is the selection while it lives
 *  - otherwise the current selection stays while it is alive and within range (no flicker between neighbours)
 *  - a dead or out-of-range selection is dropped and the nearest alive monster within range is taken
 */
export const TOUCH_TARGET_RANGE = 3;

export interface TouchCandidate<T> {
  ref: T;
  position: Point;
  alive: boolean;
}

export function chooseTouchTarget<T>(
  current: T | null,
  combatTarget: T | null,
  candidates: readonly TouchCandidate<T>[],
  me: Point,
  range = TOUCH_TARGET_RANGE,
): T | null {
  const find = (ref: T | null): TouchCandidate<T> | undefined => (ref === null ? undefined : candidates.find((c) => c.ref === ref));
  const distance = (c: TouchCandidate<T>): number => Math.hypot(c.position.x - me.x, c.position.y - me.y);
  const fought = find(combatTarget);
  if (fought?.alive) return fought.ref;
  const kept = find(current);
  if (kept?.alive && distance(kept) <= range) return kept.ref;
  let best: TouchCandidate<T> | null = null;
  for (const c of candidates) {
    if (!c.alive || distance(c) > range) continue;
    if (!best || distance(c) < distance(best)) best = c;
  }
  return best?.ref ?? null;
}
