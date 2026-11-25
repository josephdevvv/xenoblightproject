import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';

/**
 * Mobile game size (pure, unit-tested). Desktop keeps its fixed 960 x 480. On a phone or tablet the game takes the
 * shape of the screen (the landscape viewport inside the safe areas), so the canvas fills it with no black bars, no
 * stretching and no cropping:
 *
 *  - wide screens (most phones, wider than 2:1): 480 game pixels high - the HUD's height and the same pixel density as
 *    desktop - and as wide as the screen's shape asks (e.g. 2.17:1 -> 1040 x 480)
 *  - squarer screens (16:9 phones, tablets): never narrower than desktop's 960 - every screen (HUD, windows, character
 *    creation) is laid out for that width - and taller instead (16:9 -> 960 x 540, 4:3 -> 960 x 720)
 *  - beyond 2048 x 480 (wider than 4.3:1, no real device) the width stops growing
 *
 * Every UI builds from the live `scene.scale` size, and edge-anchored layouts (HUD, touch controls) follow it.
 */
export const MOBILE_VIEW = { height: GAME_HEIGHT, minWidth: GAME_WIDTH, maxWidth: 2048 } as const;

export interface GameSize {
  width: number;
  height: number;
}

export function mobileGameSize(viewWidth: number, viewHeight: number): GameSize {
  if (!(viewWidth > 0) || !(viewHeight > 0)) return { width: GAME_WIDTH, height: GAME_HEIGHT };
  // portrait never gets this far (OrientationGate); a square or taller view is treated as 4:3 landscape
  const aspect = Math.max(viewWidth / viewHeight, 4 / 3);
  const wide = Math.round(MOBILE_VIEW.height * aspect);
  if (wide >= MOBILE_VIEW.minWidth) return { width: Math.min(wide, MOBILE_VIEW.maxWidth), height: MOBILE_VIEW.height };
  return { width: MOBILE_VIEW.minWidth, height: Math.round(MOBILE_VIEW.minWidth / aspect) };
}

/** Offset that centres a layout designed for `design` in the current view (whole pixels; 0 on desktop). */
export function centerOffset(view: GameSize, design: GameSize): { x: number; y: number } {
  return { x: Math.floor((view.width - design.width) / 2), y: Math.floor((view.height - design.height) / 2) };
}

/**
 * Desktop: the game fills the browser window at the world scale it always had - the scale FIT gave the fixed 960 x 480
 * view (min(width / 960, height / 480)) - and shows more of the world instead of black bars: the logical size takes
 * the window's shape and is never smaller than 960 x 480 (so every layout fits). Beyond 4096 x 2304 it stops growing.
 */
export const DESKTOP_VIEW = { maxWidth: 4096, maxHeight: 2304 } as const;

export function desktopGameSize(viewWidth: number, viewHeight: number): GameSize {
  if (!(viewWidth > 0) || !(viewHeight > 0)) return { width: GAME_WIDTH, height: GAME_HEIGHT };
  const scale = Math.min(viewWidth / GAME_WIDTH, viewHeight / GAME_HEIGHT);
  return {
    width: Math.min(DESKTOP_VIEW.maxWidth, Math.max(GAME_WIDTH, Math.round(viewWidth / scale))),
    height: Math.min(DESKTOP_VIEW.maxHeight, Math.max(GAME_HEIGHT, Math.round(viewHeight / scale))),
  };
}
