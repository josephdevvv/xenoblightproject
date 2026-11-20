import kit from './statusKit.generated.json';

/**
 * Moonsteel status kit (art: art-source/ui/status_moonsteel, cropped by tools/import-status-kit.ps1).
 * The kit is a 480x270 canvas drawn at the game's pixel density, so it is used 1:1. All rectangles
 * below are kit-canvas pixels measured from the layer art (x, y, width, height; borders included).
 */

export interface KitLayer {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const STATUS_KIT_LAYERS: readonly KitLayer[] = kit.layers;
export const STATUS_KIT_WIDTH = kit.canvas.width;
export const STATUS_KIT_HEIGHT = kit.canvas.height;

export function statusKitTextureKey(layerId: string): string {
  return `status.${layerId}`;
}

export type KitRect = readonly [x: number, y: number, w: number, h: number];

const ROW_PITCH = 28;

export const STATUS_KIT = {
  /** Header band between the window's top border and the header divider. */
  /** Text y values are text-box tops; pixel-font capitals start 6 px below the box top. */
  header: { titleX: 114, textY: 11, rightX: 424 },
  close: [432, 16, 22, 22] as KitRect,
  /** Section rules at y 37 (left: stat column, right: derived column); captions sit under them. */
  sectionLeft: { cx: 110, y: 37 },
  sectionRight: { cx: 365, y: 37 },
  /** Stat row i: frame y = 51 + 28 i. */
  row(i: number) {
    const y = 51 + i * ROW_PITCH;
    return {
      textY: y + 2,
      labelX: 66,
      descX: 88,
      /** Right edge of the label zone (divider at x 190). */
      labelZoneRight: 187,
      /** Right edge of the value zone (191..211). */
      valueRight: 209,
      plus: [212, y - 2, 28, 28] as KitRect,
    };
  },
  /** Derived panel: caption right of the title rule (x 292..396, y 61), rows between the baked lines (pitch 11). */
  derived: { captionRight: 438, captionY: 53, listX: 286, listY: 67, listW: 156, listH: 132, rowPitch: 11, textOffsetY: -2, valueRight: 436 },
  /** Between the last row and the footer divider. */
  message: { x: 34, y: 212 },
  /** Footer centre, under the accent bracket. */
  summary: { cx: 241, y: 240 },
  footer: {
    reset: [32, 236, 72, 20] as KitRect,
    dev: [112, 236, 72, 20] as KitRect,
    cancel: [298, 236, 78, 20] as KitRect,
    confirm: [386, 236, 62, 20] as KitRect,
  },
  /** Window background colour (to cover a baked control that is not used). */
  fill: 0x141418,
} as const;
