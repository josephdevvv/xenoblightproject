import Phaser from 'phaser';
import { centerOffset, type GameSize } from '../../platform/MobileViewport';

/**
 * A screen laid out for a fixed size (character creation: 960 x 480; the main menu: its size when it was built) stays
 * centred in a larger or resized view by offsetting its camera - nothing is rebuilt, input follows the camera.
 * Screen-fixed objects (scroll factor 0: backdrop vignette, loading screen) cover the whole view themselves.
 * On desktop the view is the design size: the offset is 0 and nothing changes.
 */
export function keepCentered(scene: Phaser.Scene, design: GameSize): void {
  const apply = (): void => {
    const o = centerOffset({ width: scene.scale.width, height: scene.scale.height }, design);
    scene.cameras.main.setScroll(-o.x, -o.y);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}
