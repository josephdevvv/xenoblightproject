/**
 * Desktop (mouse + keyboard) or touch (mobile, landscape) - decided ONCE at startup and fixed for the session, so
 * the desktop version never runs a touch code path. Pure decision (unit-tested) + the session's mode.
 *
 * Touch mode: the device's primary pointer is coarse (a finger), or it reports touch points and a mobile browser.
 * A touch-screen laptop (fine primary pointer, desktop browser) stays desktop. `?mobile=1` / `?mobile=0` forces it
 * (testing in a desktop browser).
 */
export interface DeviceEnvironment {
  /** location.search */
  search: string;
  /** navigator.maxTouchPoints */
  maxTouchPoints: number;
  /** matchMedia('(pointer: coarse)').matches - the PRIMARY pointer is coarse */
  coarsePointer: boolean;
  /** navigator.userAgent */
  userAgent: string;
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|IEMobile/i;

export function detectTouchMode(env: DeviceEnvironment): boolean {
  const forced = new URLSearchParams(env.search).get('mobile');
  if (forced === '1' || forced === 'true') return true;
  if (forced === '0' || forced === 'false') return false;
  if (env.maxTouchPoints <= 0) return false;
  // iPadOS reports a desktop Safari UA ("Macintosh") but has touch points and a coarse pointer
  return env.coarsePointer || MOBILE_UA.test(env.userAgent);
}

let touchMode = false;

/** Decides the mode from the browser (call once, before the game is created). */
export function initDeviceMode(env?: DeviceEnvironment): boolean {
  const e: DeviceEnvironment = env ?? {
    search: typeof location !== 'undefined' ? location.search : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
    coarsePointer: typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
  touchMode = detectTouchMode(e);
  return touchMode;
}

/**
 * Mobile: the canvas is smoothed while the screen shows it smaller than its 960 x 480 pixels (dropping whole pixel rows
 * makes small text unreadable) and stays pixel-sharp at 1x and above.
 */
export function canvasRendering(shownScale: number): 'auto' | 'pixelated' {
  return shownScale < 1 ? 'auto' : 'pixelated';
}

/** The session runs the mobile (touch, landscape) version. */
export function isTouchMode(): boolean {
  return touchMode;
}
