/**
 * The arrow selector rows of character creation, as plain numbers (pure, unit-tested): how an arrow steps through
 * the options and where the parts of a row sit. No Phaser here - SelectorRow draws what this describes.
 */

/** The option an arrow lands on: one step left (-1) or right (+1), wrapping at both ends. */
export function cycleIndex(index: number, delta: number, count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const n = Math.floor(count);
  const from = Number.isFinite(index) ? Math.floor(index) : 0;
  const by = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  return (((from + by) % n) + n) % n;
}

/** Arrows only do something when there is another option to go to. */
export const canCycle = (count: number): boolean => Number.isFinite(count) && count > 1;

export interface SelectorRowLayout {
  width: number;
  height: number;
  /** Clickable arrow areas at both ends of the bar (centre x relative to the row centre, full row height). */
  arrowWidth: number;
  leftArrowX: number;
  rightArrowX: number;
  /** Room for the centred value between the two arrows. */
  valueWidth: number;
}

/** Width of an arrow's click area: comfortable for a finger, never more than a quarter of the bar. */
export const SELECTOR_ARROW_WIDTH = 40;

export function selectorRowLayout(width: number, height: number): SelectorRowLayout {
  const arrowWidth = Math.min(SELECTOR_ARROW_WIDTH, Math.floor(width / 4));
  return {
    width,
    height,
    arrowWidth,
    leftArrowX: -width / 2 + arrowWidth / 2,
    rightArrowX: width / 2 - arrowWidth / 2,
    valueWidth: width - arrowWidth * 2,
  };
}

/** Vertical centres of `count` rows that start at `firstY` and are `step` apart (the same gap between every row). */
export function selectorRowYs(firstY: number, step: number, count: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => firstY + i * step);
}
