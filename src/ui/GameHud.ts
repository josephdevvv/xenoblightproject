import Phaser from 'phaser';
import type { CharacterData } from '../data/CharacterData';
import type { CharacterView } from '../characters/CharacterView';
import { createNameLabel, NAME_LABEL_COLORS, placeNameLabel } from './world/WorldNameLabel';

/**
 * World-space HUD: the player's name label. The screen-space HUD (status panel, minimap, hotbar, ...) is
 * `DungeonHud`, drawn by GameUIScene.
 */
export class GameHud {
  private readonly namePlate: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, character: CharacterData) {
    this.namePlate = createNameLabel(scene, character.name, NAME_LABEL_COLORS.player);
  }

  /**
   * Keeps the name label under the character's drawn root (whole pixels, shared with the sprite; same
   * rule as monsters and NPCs): it moves with the character but never follows the animated frame, so it
   * does not bob with the walk cycle. Only the position changes: the text texture is not redrawn.
   */
  update(view: CharacterView): void {
    const root = view.getRenderRoot();
    placeNameLabel(this.namePlate, root.x, root.y);
  }
}
