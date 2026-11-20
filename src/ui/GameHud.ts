import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE } from '../config/palette';
import type { CharacterData } from '../data/CharacterData';
import type { CharacterView } from '../characters/CharacterView';
import { typo } from './UITheme';

/**
 * World-space HUD: the name plate above the player. The screen-space HUD (status panel, minimap,
 * hotbar, ...) is `DungeonHud`, drawn by GameUIScene.
 */
export class GameHud {
  private readonly namePlate: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, character: CharacterData) {
    this.namePlate = scene.add
      .text(0, 0, character.name, typo('label', PALETTE.white, { stroke: PALETTE.black, strokeThickness: 3 }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.NamePlate);
  }

  /**
   * Keeps the name plate on the character's drawn root (whole pixels, shared with the sprite) at a
   * fixed height per appearance - never the animated frame's bounds - so it moves with the character
   * but does not bounce with the walk cycle. Only the position changes: the text texture is not redrawn.
   */
  update(view: CharacterView): void {
    const root = view.getRenderRoot();
    this.namePlate.setPosition(root.x, root.y - view.getNamePlateHeight());
  }
}
