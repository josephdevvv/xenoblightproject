/**
 * The device's safe area in GAME pixels (pure helpers + the session's current value, unit-tested).
 *
 * Mobile renders edge to edge - the canvas covers the whole screen, under the notch / camera cutout, the rounded
 * corners and the home indicator - and only the in-game UI (HUD, touch controls, windows) is kept inside the safe
 * area: its cameras get the safe rectangle as their viewport (UiLayers). TouchPage measures the CSS insets
 * (env(safe-area-inset-*)) and converts them here whenever the viewport changes; desktop never sets them (all 0).
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * CSS-pixel insets of a `cssWidth` x `cssHeight` game area -> whole game pixels (rounded up: never short of the safe
 * line). The canvas covers the area with ENVELOP at a uniform scale (the game size has the area's shape), so one
 * factor serves both axes.
 */
export function insetsInGame(css: Insets, cssWidth: number, cssHeight: number, game: { width: number; height: number }): Insets {
  if (!(cssWidth > 0) || !(cssHeight > 0)) return NO_INSETS;
  const k = Math.min(game.width / cssWidth, game.height / cssHeight);
  const g = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.ceil(v * k) : 0);
  return { top: g(css.top), right: g(css.right), bottom: g(css.bottom), left: g(css.left) };
}

/** The safe rectangle of a view (never smaller than 1 x 1). */
export function safeRect(view: { width: number; height: number }, insets: Insets): Rect {
  const x = Math.min(insets.left, view.width - 1);
  const y = Math.min(insets.top, view.height - 1);
  return { x, y, width: Math.max(1, view.width - x - insets.right), height: Math.max(1, view.height - y - insets.bottom) };
}

export function sameInsets(a: Insets, b: Insets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

let current: Insets = NO_INSETS;
const listeners = new Set<(insets: Insets) => void>();

/** The safe-area insets now (game pixels; all 0 on desktop). */
export function safeInsets(): Insets {
  return current;
}

/** Sets them (mobile, on every viewport change); listeners hear only a real change. */
export function setSafeInsets(next: Insets): void {
  if (sameInsets(next, current)) return;
  current = { ...next };
  for (const fn of [...listeners]) fn(current);
}

export function onSafeInsetsChange(fn: (insets: Insets) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
