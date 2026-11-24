import Phaser from 'phaser';
import { canvasRendering } from './DeviceMode';
import type { OrientationGate } from './OrientationGate';

/**
 * The page around the game in touch mode (never on desktop):
 *  - `html.touch` turns on the touch CSS in index.html: no scrolling / overscroll, no text selection or callouts,
 *    and the game area inset by the device's safe areas (notch, rounded corners, home indicator);
 *  - pinch and double-tap zoom are blocked (iOS ignores user-scalable=no);
 *  - portrait pauses the game, landscape resumes it (OrientationGate) - nothing reloads, nothing is lost;
 *  - the canvas is smoothed when the screen shows it smaller than its 960 x 480 pixels (dropping whole pixel rows
 *    makes small text unreadable) and stays pixel-sharp at 1x and above.
 */

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
  gate.onChange((portrait) => {
    if (portrait) {
      game.pause();
      return;
    }
    game.resume();
    // the browser may report the new size a moment after the turn
    game.scale.refresh();
    window.setTimeout(() => game.scale.refresh(), 250);
  });
}
