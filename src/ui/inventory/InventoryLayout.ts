import { INVENTORY_GRID, INVENTORY_SLOT_COUNT, type EquipmentSlotId } from '../../inventory/InventorySlots';
import type { Rect } from '../passiveTree/PassiveTreeLayout';

/**
 * Inventory window layout - pure, unit-tested. Computed from the game's screen size (the canvas itself is
 * scaled to the browser window), so a smaller screen gets a smaller window with smaller slots. Everything is
 * on whole pixels; all coordinates except `window` are relative to the window's top-left corner.
 */
export interface InventoryLayout {
  /** On the screen. */
  window: Rect;
  title: Rect;
  panels: { equipment: Rect; grid: Rect; detail: Rect };
  /** Each panel's caption, and the rule under it, from the panel's top-left corner. */
  caption: { x: number; y: number; rule: number };
  equipment: Record<EquipmentSlotId, Rect>;
  silhouette: { x: number; y: number; unit: number };
  grid: readonly Rect[];
  detail: {
    icon: Rect;
    nameY: number;
    typeY: number;
    description: DetailSection;
    effects: DetailSection;
    textX: number;
    textWidth: number;
    /** EQUIP / UNEQUIP, at the bottom of the panel. */
    button: Rect;
    /** USE | ASSIGN HOTKEY for consumables: the same row split in two. */
    buttonPair: readonly [Rect, Rect];
  };
  footer: Rect;
  hint: { x: number; y: number };
  close: Rect;
}

export interface DetailSection {
  ruleY: number;
  captionY: number;
  textY: number;
  lines: number;
}

/** Full size (960x480 game screen). */
const FULL = { width: 720, height: 396 } as const;
const MARGIN = 12;
const FRAME = 4;
const HEADER = 36;
const FOOTER = 32;
const PANEL_GAP = 4;
const PANEL_PAD = 12;
const CAPTION = 26;
const SLOT_GAP = 5;
const MAX_SLOT = 40;
/** Height of the label line above an equipment slot. */
const SLOT_LABEL = 14;
export const DETAIL_LINE_HEIGHT = 14;
const BUTTON_HEIGHT = 22;

/** The silhouette's drawing grid (EquipmentPanel). */
export const SILHOUETTE_GRID = { width: 28, height: 58 } as const;

export function inventoryLayout(screenWidth: number, screenHeight: number): InventoryLayout {
  const w = Math.min(FULL.width, screenWidth - MARGIN * 2);
  const h = Math.min(FULL.height, screenHeight - MARGIN * 2);
  const window: Rect = [Math.floor((screenWidth - w) / 2), Math.floor((screenHeight - h) / 2), w, h];

  // Panels: equipment | grid | detail
  const top = HEADER;
  const panelH = h - HEADER - FOOTER - FRAME * 2;
  const inner = w - FRAME * 2 - PANEL_GAP * 2;
  const side = Math.floor(inner * 0.295);
  const mid = inner - side * 2;
  const equipment: Rect = [FRAME, top, side, panelH];
  const grid: Rect = [FRAME + side + PANEL_GAP, top, mid, panelH];
  const detail: Rect = [FRAME + side + mid + PANEL_GAP * 2, top, side, panelH];

  // Bag grid, centred in its panel under the caption
  const { columns, rows } = INVENTORY_GRID;
  const roomW = mid - PANEL_PAD * 2 - SLOT_GAP * (columns - 1);
  const roomH = panelH - CAPTION - PANEL_PAD - SLOT_GAP * (rows - 1);
  const slot = Math.max(8, Math.min(MAX_SLOT, Math.floor(roomW / columns), Math.floor(roomH / rows)));
  const gridW = columns * slot + (columns - 1) * SLOT_GAP;
  const gridH = rows * slot + (rows - 1) * SLOT_GAP;
  const gx = grid[0] + Math.floor((mid - gridW) / 2);
  const gy = top + CAPTION + Math.floor((panelH - CAPTION - gridH) / 2);
  const slots = Array.from({ length: INVENTORY_SLOT_COUNT }, (_, i): Rect => [gx + (i % columns) * (slot + SLOT_GAP), gy + Math.floor(i / columns) * (slot + SLOT_GAP), slot, slot]);

  // Equipment: hat above the head, armor on the chest, shoes under the feet, weapon / charm at the hands
  const cx = equipment[0] + Math.floor(side / 2);
  const left = cx - Math.floor(slot / 2);
  const hatY = top + CAPTION + 2 + SLOT_LABEL;
  const shoesY = top + panelH - 8 - slot;
  const bodyTop = hatY + slot;
  const bodyBottom = shoesY - SLOT_LABEL - 1;
  const unit = Math.max(1, Math.floor((bodyBottom - bodyTop) / SILHOUETTE_GRID.height));
  const bodyY = bodyTop + Math.floor((bodyBottom - bodyTop - unit * SILHOUETTE_GRID.height) / 2);
  const armorY = bodyY + unit * 15;
  const handY = bodyY + unit * 24;
  const inset = Math.max(4, Math.floor((side - slot * 3) / 5));

  // Detail: icon, name, type, then the description and effects sections
  const iconSize = Math.max(32, Math.min(64, Math.floor(panelH * 0.21)));
  const iconY = top + CAPTION + 6;
  const nameY = iconY + iconSize + 6;
  const typeY = nameY + 18;
  const descRule = typeY + 20;
  const descText = descRule + 20;
  const buttonY = top + panelH - 8 - BUTTON_HEIGHT;
  const bottom = buttonY - 4;
  // 22 px = rule + caption of the second section; the description gets the larger share of the lines
  const lines = Math.max(2, Math.floor((bottom - descText - 22) / DETAIL_LINE_HEIGHT));
  const descLines = Math.max(1, Math.ceil(lines * 0.55));
  const effectsRule = descText + descLines * DETAIL_LINE_HEIGHT + 2;

  return {
    window,
    title: [Math.floor((w - 198) / 2), 5, 198, 27],
    panels: { equipment, grid, detail },
    caption: { x: PANEL_PAD, y: 4, rule: CAPTION - 4 },
    equipment: {
      weapon: [equipment[0] + inset, handY, slot, slot],
      hat: [left, hatY, slot, slot],
      armor: [left, armorY, slot, slot],
      shoes: [left, shoesY, slot, slot],
      charm: [equipment[0] + side - inset - slot, handY, slot, slot],
    },
    silhouette: { x: cx - Math.floor((unit * SILHOUETTE_GRID.width) / 2), y: bodyY, unit },
    grid: slots,
    detail: {
      icon: [detail[0] + Math.floor((side - iconSize) / 2), iconY, iconSize, iconSize],
      nameY,
      typeY,
      description: { ruleY: descRule, captionY: descRule + 3, textY: descText, lines: descLines },
      effects: { ruleY: effectsRule, captionY: effectsRule + 3, textY: effectsRule + 20, lines: Math.max(1, lines - descLines) },
      textX: detail[0] + PANEL_PAD,
      textWidth: side - PANEL_PAD * 2,
      button: [detail[0] + PANEL_PAD, buttonY, side - PANEL_PAD * 2, BUTTON_HEIGHT],
      buttonPair: splitButton([detail[0] + PANEL_PAD, buttonY, side - PANEL_PAD * 2, BUTTON_HEIGHT]),
    },
    footer: [FRAME, top + panelH + FRAME, w - FRAME * 2, FOOTER],
    hint: { x: FRAME + PANEL_PAD, y: top + panelH + FRAME + Math.floor(FOOTER / 2) },
    close: [w - FRAME - PANEL_PAD - 98, top + panelH + FRAME + Math.floor((FOOTER - 20) / 2), 98, 20],
  };
}

/** One button row as two buttons with a gap; the right one takes the odd pixel. */
function splitButton([x, y, w, h]: Rect): readonly [Rect, Rect] {
  const gap = 6;
  const left = Math.floor((w - gap) / 2);
  return [
    [x, y, left, h],
    [x + left + gap, y, w - left - gap, h],
  ];
}

/** Scale of an icon in a square box: whole steps up, shrunk only when it is too big. */
export function iconScale(width: number, height: number, box: number): number {
  const fit = box / Math.max(1, width, height);
  return fit >= 1 ? Math.floor(fit) : fit;
}
