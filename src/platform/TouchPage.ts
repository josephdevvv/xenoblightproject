import Phaser from 'phaser';
import { canvasRendering } from './DeviceMode';
import { mobileGameSize, type GameSize } from './MobileViewport';
import { insetsInGame, setSafeInsets, type Insets } from './SafeArea';
import type { OrientationGate } from './OrientationGate';

/**
 * The page around the game in touch mode (never on desktop):
 *  - `html.touch` turns on the touch CSS in index.html: no scrolling / overscroll, no text selection or callouts,
 *    and the game area covering the whole screen edge to edge (also as an installed app: fullscreen manifest);
 *  - the device's safe areas (notch / cutout, rounded corners, home indicator) are measured with every fit and given
 *    to the game in game pixels (SafeArea): the in-game UI keeps inside them, the world fills the screen;
 *  - pinch and double-tap zoom are blocked (iOS ignores user-scalable=no);
 *  - portrait pauses the game, landscape resumes it (OrientationGate) - nothing reloads, nothing is lost;
 *  - the game size follows the landscape viewport (MobileViewport): resized on every viewport change (browser bars,
 *    split screen, a different landscape size after turning) - the canvas always fills the screen, no bars;
 *  - the canvas is smoothed when the screen shows it smaller than its 960 x 480 pixels (dropping whole pixel rows
 *    makes small text unreadable) and stays pixel-sharp at 1x and above.
 */

/** The game area's size in CSS pixels (the whole viewport: #game-container). */
export function gameContainerSize(doc: Document = document): [number, number] {
  const el = doc.getElementById('game-container');
  const w = el?.clientWidth || window.innerWidth;
  const h = el?.clientHeight || window.innerHeight;
  return [w, h];
}

/** env(safe-area-inset-*) in CSS pixels, read from a probe element (index.html #safe-area-probe). */
export function readSafeAreaCss(doc: Document = document): Insets {
  let probe = doc.getElementById('safe-area-probe');
  if (!probe) {
    probe = doc.createElement('div');
    probe.id = 'safe-area-probe';
    doc.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  const px = (v: string): number => parseFloat(v) || 0;
  return { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
}

/** Measures the safe area for a game of `size` covering the game area, and hands it to the game (SafeArea). */
export function updateSafeArea(size: GameSize): void {
  const [w, h] = gameContainerSize();
  setSafeInsets(insetsInGame(readSafeAreaCss(), w, h, size));
}

/** Before the game exists: the page itself. */
export function prepareTouchPage(doc: Document = document): void {
  doc.documentElement.classList.add('touch');
  const block = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };
  // iOS Safari pinch gestures, double-tap zoom, multi-finger page zoom / scrolling
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) doc.addEventListener(type, block, { passive: false });
  doc.addEventListener('touchmove', (e) => (e.touches.length > 1 || e.target === doc.body || e.target === doc.documentElement) && block(e), { passive: false });
}

/** Once the game exists: orientation pause / resume and the canvas smoothing. */
export function attachTouchGame(game: Phaser.Game, gate: OrientationGate): void {
  const sync = (): void => {
    const canvas = game.canvas;
    if (!canvas) return;
    canvas.style.imageRendering = canvasRendering(game.scale.displayScale.x > 0 ? 1 / game.scale.displayScale.x : 1);
  };
  game.events.once(Phaser.Core.Events.READY, sync);
  game.scale.on(Phaser.Scale.Events.RESIZE, sync);
  // the game size follows the viewport (landscape only; a burst of resize events settles first)
  let timer = 0;
  const fit = (): void => {
    if (gate.portrait) return;
    const next = mobileGameSize(...gameContainerSize());
    const now = game.scale.gameSize;
    // the safe area first: the in-game UI rebuilds for the new size and insets together
    updateSafeArea(next);
    if (next.width !== now.width || next.height !== now.height) game.scale.setGameSize(next.width, next.height);
    else game.scale.refresh();
    sync();
  };
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 120);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  gate.onChange((portrait) => {
    if (portrait) {
      game.pause();
      return;
    }
    game.resume();
    // the browser may report the new size a moment after the turn
    schedule();
    window.setTimeout(schedule, 300);
  });
}
