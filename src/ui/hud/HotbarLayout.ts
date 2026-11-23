import { HOTBAR_SIZE } from '../../hotbar/Hotbar';
import type { ScreenRect } from './HudLayout';

/**
 * Hotbar slots above the EXP bar - pure, unit-tested. Same slot size, 1-px frame and 4-px spacing as the HUD
 * pack's hotbar art (measured: 33 x 37 at game size), 8 slots, centred on the screen, with a wider gap and a
 * thin divider between slots 4 and 5 (like the reference). Whole pixels only.
 */
export const HOTBAR_SLOT = { width: 33, height: 37, gap: 4, middleGap: 9 } as const;

export interface HotbarLayout {
  slots: readonly ScreenRect[];
  /** The divider between the two halves (x, top, height). */
  divider: { x: number; y: number; height: number };
}

/** `top`: y of the slots' top edge (where the pack's hotbar art had them). */
export function hotbarLayout(screenWidth: number, top: number): HotbarLayout {
  const { width, height, gap, middleGap } = HOTBAR_SLOT;
  const half = HOTBAR_SIZE / 2;
  const total = HOTBAR_SIZE * width + (HOTBAR_SIZE - 2) * gap + middleGap;
  const left = Math.floor((screenWidth - total) / 2);
  const slots = Array.from({ length: HOTBAR_SIZE }, (_, i): ScreenRect => ({
    x: left + i * (width + gap) + (i >= half ? middleGap - gap : 0),
    y: top,
    width,
    height,
  }));
  const dividerX = slots[half - 1].x + width + Math.floor(middleGap / 2);
  return { slots, divider: { x: dividerX, y: top - 3, height: height + 6 } };
}
