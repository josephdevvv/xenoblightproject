import type Phaser from 'phaser';
import type { Direction } from '../core/Direction';
import { characterFrameIndex } from './CharacterSheetLayout';

/**
 * Shows the static frame for the character's facing direction via setFrame().
 * Knows nothing about input or movement; controllers just tell it which way the character faces.
 * (Replaces the old idle/walk AnimationController until animated sheets exist.)
 */
export class DirectionalFrameController {
  private direction: Direction = 'S';

  constructor(private readonly sprite: Phaser.GameObjects.Sprite) {
    this.apply();
  }

  setDirection(direction: Direction): void {
    if (direction === this.direction) return;
    this.direction = direction;
    this.apply();
  }

  getDirection(): Direction {
    return this.direction;
  }

  /** Re-applies the current frame (call after the sprite's texture changes). */
  apply(): void {
    this.sprite.setFrame(characterFrameIndex(this.direction));
  }
}
