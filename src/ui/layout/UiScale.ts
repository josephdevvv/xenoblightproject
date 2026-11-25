/**
 * In-game UI scale (pure, unit-tested). The player picks 100-150 % (step 5) in the in-game Settings; the world, the
 * characters and the camera never change. The in-game UI is drawn by two zoomed cameras (UiLayers):
 *
 *  - the HUD layer (status block, quest tracker, minimap, menu, hotbar, banners, notices, touch controls) zooms by
 *    the chosen scale - as long as the room it needs still fits the view (HUD_SPACE);
 *  - the window layer (Inventory, Status, Skills, Passive Tree, Auto Play, Settings, dialogue, death screen...) zooms
 *    by the same scale, but never so far that a full-size window would leave the view (WINDOW_SPACE).
 *
 * So everything stays inside the screen at every scale; on a small or squat view a layer stops growing where it would
 * no longer fit (the Settings row says so). At 100 % both zooms are 1: exactly the UI as it was.
 */
export const UI_SCALE = { min: 100, max: 150, step: 5, default: 100 } as const;

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

/** A stored / chosen value as a valid percentage: a whole step between 100 and 150 (default for anything else). */
export function clampUiScale(percent: unknown): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return UI_SCALE.default;
  const stepped = Math.round(percent / UI_SCALE.step) * UI_SCALE.step;
  return Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, stepped));
}

export interface UiZooms {
  hud: number;
  windows: number;
  /** The largest scale (percent, on a step) the HUD can use on this view. */
  hudLimit: number;
}

/** The zoom of each UI layer for a chosen scale (percent) on a view of `view` game pixels. Never below 1. */
export function uiZooms(view: ViewSize, percent: number, touch = false): UiZooms {
  const want = clampUiScale(percent) / 100;
  const hudRoom = touch ? HUD_SPACE.touch : HUD_SPACE.desktop;
  const fit = (room: ViewSize): number => Math.max(1, Math.min(view.width / room.width, view.height / room.height));
  const hudFit = fit(hudRoom);
  const hud = Math.min(want, hudFit);
  const windows = Math.min(want, fit(WINDOW_SPACE));
  const hudLimit = Math.max(UI_SCALE.min, Math.min(UI_SCALE.max, Math.floor((hudFit * 100) / UI_SCALE.step) * UI_SCALE.step));
  return { hud, windows, hudLimit };
}

/** The room (whole UI pixels) a layer has at a zoom. */
export function layerSpace(view: ViewSize, zoom: number): ViewSize {
  return { width: Math.floor(view.width / zoom), height: Math.floor(view.height / zoom) };
}
