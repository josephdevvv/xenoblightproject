import Phaser from 'phaser';
import type { CharacterView } from './CharacterView';

/**
 * Every live CharacterView (local player, previews, and later remote players).
 * Used for debug stats now and as the hook for nearby-player visibility later.
 */
export class CharacterRegistry {
  private readonly views = new Set<CharacterView>();

  add(view: CharacterView): void {
    this.views.add(view);
  }

  remove(view: CharacterView): void {
    this.views.delete(view);
  }

  get size(): number {
    return this.views.size;
  }

  /** Characters whose sprite intersects its own scene's main camera view. */
  countVisible(): number {
    let visible = 0;
    for (const view of this.views) {
      const sprite = view.sprite;
      if (!sprite.active || !sprite.visible || !sprite.scene?.sys.isActive()) continue;
      const camera = sprite.scene.cameras.main;
      if (Phaser.Geom.Rectangle.Overlaps(camera.worldView, sprite.getBounds())) visible++;
    }
    return visible;
  }
}
