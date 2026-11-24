import pack from './hudPack.generated.json';
import { MENU_BAR, menuSlotLefts } from './MenuBarArt';

/**
 * Dungeon HUD layout (art: art-source/ui/dungeon_hud, converted by tools/import-hud-pack.ps1).
 *
 * The pack is authored on a 1664x940 reference canvas at twice the game's pixel density, so every
 * reference coordinate is halved. The halved canvas (832x470) is narrower and shorter than the
 * game view (960x480), so each layer is pinned to the screen edge it belongs to (left / right /
 * centre, top / bottom) instead of being stretched.
 *
 * Positions come from hud_layout.json (`pack.layout`). Elements the JSON does not list (menu
 * slots, minimap, hotbar slots, chat tabs...) were measured from the layer art: REF_ELEMENTS.
 */

export type HudLayerId = (typeof pack.layers)[number]['id'];
export type RefRect = readonly [x: number, y: number, w: number, h: number];

export interface HudLayerInfo {
  id: string;
  url: string;
  refX: number;
  refY: number;
  width: number;
  height: number;
}

export const HUD_LAYERS: readonly HudLayerInfo[] = pack.layers;
export const HUD_LAYOUT = pack.layout;
export const HUD_REF_WIDTH = pack.layout.reference_resolution.width;
export const HUD_REF_HEIGHT = pack.layout.reference_resolution.height;

export function hudTextureKey(layerId: string): string {
  return `hud.${layerId}`;
}

type Anchor = { h: 'left' | 'center' | 'right'; v: 'top' | 'bottom' };

/** Which screen edge each layer (and everything drawn on it) is pinned to. */
const LAYER_ANCHORS: Record<string, Anchor> = {
  '01_player_status': { h: 'left', v: 'top' },
  '02_quest_auto': { h: 'left', v: 'top' },
  '03_map_and_menu': { h: 'right', v: 'top' },
  '04_chat': { h: 'left', v: 'bottom' },
  '05_hotbar': { h: 'center', v: 'bottom' },
  '06_exp_bar': { h: 'center', v: 'bottom' },
};

/** Reference-canvas rectangles measured from the layer PNGs (2-px borders included). */
export const REF_ELEMENTS = {
  playerPanel: [15, 10, 470, 64],
  /** The 6 menu slots, centred in the bar with equal spacing (drawn in code - see MenuBarArt). */
  menuSlots: menuSlotLefts().map((p) => [MENU_BAR.layerRefX + 2 * p, MENU_BAR.slotRefY, MENU_BAR.slotRefWidth, MENU_BAR.slotRefHeight] as const),
  minimap: [1440, 70, 199, 121],
  coordinateBox: [1504, 201, 134, 26],
  questPins: [148, 199, 250].map((y) => [25, y, 10, 34] as const),
  /** The quest tracker's button box (Navigate), baked into 02_quest_auto. */
  questNavButton: [235, 144, 78, 33],
  chatTabs: [
    [15, 859, 60, 17],
    [77, 859, 71, 17],
    [150, 859, 69, 17],
  ],
  chatInput: [15, 874, 453, 19],
  hotbarSlots: [577, 651, 725, 799, 873, 947, 1021, 1095, 1169, 1243].map((x) => [x, 817, 67, 76] as const),
} as const;

/** Which menu slot (0-based, left to right) each button takes: slot 5 is a placeholder (three bars), slot 6 Settings. */
export const MENU_SLOT = { status: 0, passive: 1, skills: 2, inventory: 3, more: 4, settings: 5 } as const;

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converts reference-canvas coordinates of one layer to game (screen) pixels. */
export class HudSpace {
  private readonly offX: Record<Anchor['h'], number>;
  private readonly offY: Record<Anchor['v'], number>;

  constructor(screenWidth: number, screenHeight: number) {
    const w = HUD_REF_WIDTH / 2;
    const h = HUD_REF_HEIGHT / 2;
    this.offX = { left: 0, center: Math.floor((screenWidth - w) / 2), right: screenWidth - w };
    this.offY = { top: 0, bottom: screenHeight - h };
  }

  x(layer: HudLayerId, refX: number): number {
    return Math.floor(refX / 2) + this.offX[anchorOf(layer).h];
  }

  y(layer: HudLayerId, refY: number): number {
    return Math.floor(refY / 2) + this.offY[anchorOf(layer).v];
  }

  point(layer: HudLayerId, p: { x: number; y: number }): { x: number; y: number } {
    return { x: this.x(layer, p.x), y: this.y(layer, p.y) };
  }

  /**
   * Outer box of a frame drawn with 2-px reference borders, in screen pixels. The converter keeps
   * every even texel, so a 2-px line starting at texel k lands on pixel ceil(k / 2).
   */
  frame(layer: HudLayerId, r: RefRect): ScreenRect {
    const [x, y, w, h] = r;
    const a = anchorOf(layer);
    const left = Math.ceil(x / 2) + this.offX[a.h];
    const top = Math.ceil(y / 2) + this.offY[a.v];
    const right = Math.ceil((x + w - 2) / 2) + this.offX[a.h];
    const bottom = Math.ceil((y + h - 2) / 2) + this.offY[a.v];
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  /** Inside of a frame (excluding its 1-px converted border). */
  inner(layer: HudLayerId, r: RefRect): ScreenRect {
    const o = this.frame(layer, r);
    return { x: o.x + 1, y: o.y + 1, width: o.width - 2, height: o.height - 2 };
  }

  /** A solid reference area (e.g. a bar's `fill_rect`): every pixel whose sampled texel lies inside. */
  fill(layer: HudLayerId, r: RefRect): ScreenRect {
    const [x, y, w, h] = r;
    const a = anchorOf(layer);
    const left = Math.ceil(x / 2);
    const top = Math.ceil(y / 2);
    // Right / bottom include the frame's 1-px inner inset so the fill meets the border evenly.
    const right = Math.min(Math.floor((x + w) / 2), Math.floor((HUD_REF_WIDTH - 1) / 2));
    const bottom = Math.min(Math.floor((y + h) / 2), Math.floor((HUD_REF_HEIGHT - 1) / 2));
    const width = right - left + 1;
    const height = bottom - top + 1;
    return { x: left + this.offX[a.h], y: top + this.offY[a.v], width, height };
  }
}

function anchorOf(layer: string): Anchor {
  return LAYER_ANCHORS[layer] ?? { h: 'left', v: 'top' };
}
