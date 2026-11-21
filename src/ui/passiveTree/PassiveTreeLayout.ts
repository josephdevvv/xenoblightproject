import art from './passiveTreeArt.generated.json';
import type { PassiveBranch, PassiveIconId } from '../../passives/PassiveTree';

/**
 * Passive Tree window layout. Chrome art: art-source/ui/passive_tree_minimal (1780x883 reference),
 * halved by tools/import-passive-tree.mjs, so every coordinate here is in the HALVED canvas (890x441)
 * - measured from the imported layers. Only the window chrome comes from the pack; the tree itself
 * (10 nodes + lines) is drawn from data, the pack's placeholder nodes / connectors are not used.
 */

export interface TreeArtLayer {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const PASSIVE_TREE_LAYERS: readonly TreeArtLayer[] = art.layers;
export const PASSIVE_ICON_SHEET = art.icons;

export function passiveTreeTextureKey(layerId: string): string {
  return `passiveTree.${layerId}`;
}
export const PASSIVE_ICON_TEXTURE = 'passiveTree.icons';

export function passiveIconFrame(icon: PassiveIconId): number {
  const f = art.icons.frames.find((fr) => fr.id === icon);
  if (!f) throw new Error(`passive icon ${icon} missing from the icon sheet`);
  return f.frame;
}

export type Rect = readonly [x: number, y: number, w: number, h: number];

export const TREE_UI = {
  /** Outer window frame (01_window_and_panels). */
  window: [98, 27, 692, 400] as Rect,
  header: {
    /** Left of the title box: class caption + class name. */
    classX: 112,
    textY: 38,
    /** Title box (02_header) with its two red marks. */
    title: [346, 34, 198, 27] as Rect,
    /** Right box: available points. */
    points: [645, 35, 124, 23] as Rect,
  },
  /** Tree panel (lines at y 64 / 334, x 103 / 784). */
  treePanel: [103, 64, 682, 271] as Rect,
  /** Hint / message line inside the top of the tree panel, and the key help at its bottom. */
  hint: { cx: 444, y: 68 },
  keys: { x: 110, y: 318 },
  detail: {
    /** Baked octagon icon slot (127..159 x 348..380). */
    icon: { cx: 143, cy: 364 },
    /** Text column between the separators at x 175 / 411 / 614. */
    info: { x: 182, right: 405 },
    effect: { x: 418, right: 608 },
    rows: [341, 355, 369] as const,
    /** Unlock / upgrade button (635..759 x 352..377). */
    unlock: [635, 352, 125, 26] as Rect,
  },
  footer: {
    reset: [334, 399, 99, 20] as Rect,
    close: [458, 399, 98, 20] as Rect,
  },
} as const;

/** Node frame sizes (odd, so the icon centres on a whole pixel) and octagon corner cuts. */
export const NODE_FRAME = {
  center: { size: 45, cut: 13 },
  branch: { size: 33, cut: 9 },
} as const;

/**
 * Node centres: the mandatory center, 3 nodes to the left, 3 to the right, 3 downward. No upper
 * branch. Steps are 90 px apart sideways and 58 px downward.
 */
const CENTER = { x: 444, y: 110 };
const SIDE_STEP = 90;
const DOWN_FIRST = 72;
const DOWN_STEP = 58;

export function nodeCenter(branch: PassiveBranch, step: number): { x: number; y: number } {
  switch (branch) {
    case 'center':
      return { ...CENTER };
    case 'left':
      return { x: CENTER.x - SIDE_STEP * step, y: CENTER.y };
    case 'right':
      return { x: CENTER.x + SIDE_STEP * step, y: CENTER.y };
    case 'down':
      return { x: CENTER.x, y: CENTER.y + DOWN_FIRST + DOWN_STEP * (step - 1) };
  }
}

/**
 * Pixel spans of an octagon outline (1-px line) for a size x size frame with corner `cut`: one span
 * per row [left, right] of the shape; outline = first / last row full, else the two edge pixels.
 */
export function octagonRows(size: number, cut: number): Array<[number, number]> {
  const rows: Array<[number, number]> = [];
  for (let y = 0; y < size; y++) {
    const inset = Math.max(0, cut - y, cut - (size - 1 - y));
    rows.push([inset, size - 1 - inset]);
  }
  return rows;
}
