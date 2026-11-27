import Phaser from 'phaser';
import type { GameSize } from '../../platform/MobileViewport';
import { onSafeInsetsChange, safeInsets, safeRect } from '../../platform/SafeArea';

/**
 * A screen laid out for a fixed size (character creation: 960 x 480; the main menu: its size when it was built) stays
 * centred in a larger or resized view by offsetting its camera - nothing is rebuilt, input follows the camera.
 * Mobile: centred in the device's safe area (SafeArea), and with `fitSafe` drawn smaller when the design is wider or
 * taller than it (a notched phone: never under the cutout; the camera zoom, pixel-sharp at 1).
 * Screen-fixed objects (scroll factor 0: backdrop vignette, loading screen) cover the whole view themselves.
 * On desktop the view is the design size and there are no insets: nothing changes.
 */
export function keepCentered(scene: Phaser.Scene, design: GameSize, options: { fitSafe?: boolean } = {}): void {
  const apply = (): void => {
    const safe = safeRect({ width: scene.scale.width, height: scene.scale.height }, safeInsets());
    const zoom = options.fitSafe ? Math.min(1, safe.width / design.width, safe.height / design.height) : 1;
    // camera from its top-left corner: screen = (world - scroll) x zoom; the design centred in the safe rectangle
    const x = safe.x + (safe.width - design.width * zoom) / 2;
    const y = safe.y + (safe.height - design.height * zoom) / 2;
    scene.cameras.main.setOrigin(0, 0).setZoom(zoom).setScroll(-Math.floor(x) / zoom, -Math.floor(y) / zoom);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  const offSafe = onSafeInsetsChange(apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, apply);
    offSafe();
  });
}
