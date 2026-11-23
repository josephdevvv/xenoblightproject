import { HOTBAR_SIZE } from '../../hotbar/Hotbar';
import type { Rect } from '../passiveTree/PassiveTreeLayout';

/** Compact window: 8 hotkey slots in two rows of four. */
export const COLUMNS = 4;
export const SLOT = 40;
export const GAP = 8;
export const PAD = 16;
export const TITLE = 34;
export const HINT = 22;
export const BUTTON = { width: 96, height: 20 } as const;

/** Window layout from the screen size - pure (exported for tests). Coordinates relative to the window except `window`. */
export function hotbarAssignLayout(screenWidth: number, screenHeight: number): { window: Rect; slots: Rect[]; slotArea: Rect; hint: [number, number]; cancel: Rect } {
  const rows = HOTBAR_SIZE / COLUMNS;
  const gridW = COLUMNS * SLOT + (COLUMNS - 1) * GAP;
  const gridH = rows * SLOT + (rows - 1) * GAP;
  const w = gridW + PAD * 2;
  const h = TITLE + HINT + gridH + 12 + BUTTON.height + PAD;
  const window: Rect = [Math.floor((screenWidth - w) / 2), Math.floor((screenHeight - h) / 2), w, h];
  const top = TITLE + HINT;
  const slots = Array.from({ length: HOTBAR_SIZE }, (_, i): Rect => [PAD + (i % COLUMNS) * (SLOT + GAP), top + Math.floor(i / COLUMNS) * (SLOT + GAP), SLOT, SLOT]);
  return {
    window,
    slots,
    slotArea: [PAD - 4, top - 4, gridW + 8, gridH + 8],
    hint: [Math.floor(w / 2), TITLE + 2],
    cancel: [Math.floor((w - BUTTON.width) / 2), top + gridH + 12, BUTTON.width, BUTTON.height],
  };
}

