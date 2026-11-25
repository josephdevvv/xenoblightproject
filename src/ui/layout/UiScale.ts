/**
 * In-game UI scale (pure, unit-tested). The player picks it in the in-game Settings: 100 % by default (the UI as it
 * was), in steps of 5, with no upper limit; the world, the characters and the camera never change. The in-game UI is
 * drawn by two zoomed cameras (UiLayers):
 *
 *  - the HUD layer (status block, quest tracker, minimap, menu, hotbar, banners, notices, touch controls) zooms by
 *    exactly the chosen scale, every piece kept anchored to its screen edge (responsive positioning);
 *  - the window layer (Inventory, Status, Skills, Passive Tree, Auto Play, Settings, dialogue, death screen...) zooms
 *    by the same scale as long as a full-size window still fits the view (WINDOW_SPACE) - beyond that a window's
 *    close button would be off the screen. The Settings row says so ("windows grow up to N % on this screen").
 *
 * HUD_SPACE is the room the HUD's pieces need side by side: up to that scale they never touch each other.
 */
export const UI_SCALE = { min: 100, step: 5, default: 100 } as const;

/** The room (UI pixels) each layer's layout needs: the HUD's pieces side by side, the largest window with margins. */
export const HUD_SPACE = {
  desktop: { width: 640, height: 320 },
  /** Mobile: the joystick and the action wheel at the bottom corners need more. */
  touch: { width: 800, height: 400 },
} as const;
export const WINDOW_SPACE = { width: 744, height: 428 } as const;

export interface ViewSize {
  width: number;
  height: number;
}

/** A stored / chosen value as a valid percentage: a whole step, at least 100 (default for anything that is not a number). */
export function clampUiScale(percent: unknown): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return UI_SCALE.default;
  const stepped = Math.round(percent / UI_SCALE.step) * UI_SCALE.step;
  return Math.max(UI_SCALE.min, stepped);
}

export interface UiZooms {
  hud: number;
  windows: number;
  /** The largest scale (percent, on a step) the windows can use on this view. */
  windowsLimit: number;
}

/** The zoom of each UI layer for a chosen scale (percent) on a view of `view` game pixels. Never below 1. */
export function uiZooms(view: ViewSize, percent: number): UiZooms {
  const want = clampUiScale(percent) / 100;
  const windowsFit = Math.max(1, Math.min(view.width / WINDOW_SPACE.width, view.height / WINDOW_SPACE.height));
  const windows = Math.min(want, windowsFit);
  const windowsLimit = Math.max(UI_SCALE.min, Math.floor((windowsFit * 100) / UI_SCALE.step) * UI_SCALE.step);
  return { hud: want, windows, windowsLimit };
}

/** The room (whole UI pixels) a layer has at a zoom. */
export function layerSpace(view: ViewSize, zoom: number): ViewSize {
  return { width: Math.floor(view.width / zoom), height: Math.floor(view.height / zoom) };
}
