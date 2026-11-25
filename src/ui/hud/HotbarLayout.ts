import { HOTBAR_SIZE } from '../../hotbar/Hotbar';
import type { ScreenRect } from './HudLayout';

/**
 * Hotbar row above the EXP bar - pure, unit-tested. The 8 hotbar slots (the HUD pack art's size and 1-px frame,
 * 4-px spacing, a wider gap with a thin divider between 4 and 5), then the two potion slots Q (HP) and W (SP) in the
 * same size, then the Auto Play button - the whole row centred on the screen. Whole pixels only.
 */
export const HOTBAR_SLOT = { width: 33, height: 37, gap: 4, middleGap: 9 } as const;

/** The Auto Play button right of the potion slots. */
export const AUTO_BUTTON = { width: 44, gap: 10 } as const;
/** Gap between slot 8 and the potion slots (as wide as the middle gap, with its own divider). */
export const POTION_GROUP_GAP = HOTBAR_SLOT.middleGap;

export interface HotbarLayout {
  slots: readonly ScreenRect[];
  /** Q (HP potion), W (SP potion). */
  potionSlots: readonly [ScreenRect, ScreenRect];
  /** Auto Play button: right of W, same height. */
  autoButton: ScreenRect;
  /** The divider between the two halves (x, top, height). */
  divider: { x: number; y: number; height: number };
  /** The divider between slot 8 and Q. */
  potionDivider: { x: number; y: number; height: number };
}

/**
 * Mobile: the top-right menu bar (its frame, the six slots, icons, highlights, pips and touch areas) is drawn 30 %
 * larger, anchored at its top-right corner. The bar is the top 23 rows of 03_map_and_menu.png, the minimap frame
 * starts at row 30: the map block under it (minimap, coordinates, map name, AUTO, notices) moves down by what the bar
 * grew, so the 7-row gap stays.
 */
export const TOUCH_MENU = { scale: 1.3, barRows: 23, mapTopRow: 30 } as const;

/** How far the map block moves down on mobile (whole pixels). */
export function touchMapShift(): number {
  return Math.ceil(TOUCH_MENU.barRows * (TOUCH_MENU.scale - 1));
}

/** Mobile: the AUTO button right-aligned with the minimap, just below the map name (the hotbar row is hidden). */
export function touchAutoButtonRect(minimapRight: number, belowMapName: number): ScreenRect {
  return { x: minimapRight - AUTO_BUTTON.width, y: belowMapName, width: AUTO_BUTTON.width, height: HOTBAR_SLOT.height };
}

/** Width of the whole row (8 slots, Q / W, Auto Play). */
export function hotbarRowWidth(): number {
  const { width, gap, middleGap } = HOTBAR_SLOT;
  const eight = HOTBAR_SIZE * width + (HOTBAR_SIZE - 2) * gap + middleGap;
  return eight + POTION_GROUP_GAP + width * 2 + gap + AUTO_BUTTON.gap + AUTO_BUTTON.width;
}

/** `top`: y of the slots' top edge (where the pack's hotbar art had them). */
export function hotbarLayout(screenWidth: number, top: number): HotbarLayout {
  const { width, height, gap, middleGap } = HOTBAR_SLOT;
  const half = HOTBAR_SIZE / 2;
  const left = Math.floor((screenWidth - hotbarRowWidth()) / 2);
  const slots = Array.from({ length: HOTBAR_SIZE }, (_, i): ScreenRect => ({
    x: left + i * (width + gap) + (i >= half ? middleGap - gap : 0),
    y: top,
    width,
    height,
  }));
  const dividerX = slots[half - 1].x + width + Math.floor(middleGap / 2);
  const last = slots[HOTBAR_SIZE - 1];
  const qx = last.x + width + POTION_GROUP_GAP;
  const potionSlots: [ScreenRect, ScreenRect] = [
    { x: qx, y: top, width, height },
    { x: qx + width + gap, y: top, width, height },
  ];
  const w = potionSlots[1];
  const autoButton = { x: w.x + width + AUTO_BUTTON.gap, y: top, width: AUTO_BUTTON.width, height };
  return {
    slots,
    potionSlots,
    autoButton,
    divider: { x: dividerX, y: top - 3, height: height + 6 },
    potionDivider: { x: last.x + width + Math.floor(POTION_GROUP_GAP / 2), y: top - 3, height: height + 6 },
  };
}
