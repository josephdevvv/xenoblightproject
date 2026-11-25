import type Phaser from 'phaser';
import { desktopGameSize } from './MobileViewport';
import { gameContainerSize } from './TouchPage';

/**
 * Desktop: the game size follows the browser window (desktopGameSize) - resized while the window is dragged (a short
 * settle), so the canvas always fills it at the same world scale; Phaser's scale manager keeps the mouse mapping exact.
 */
export function attachDesktopViewport(game: Phaser.Game): void {
  let timer = 0;
  const fit = (): void => {
    const next = desktopGameSize(...gameContainerSize());
    const now = game.scale.gameSize;
    if (next.width !== now.width || next.height !== now.height) game.scale.setGameSize(next.width, next.height);
    else game.scale.refresh();
  };
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 80);
  });
}
