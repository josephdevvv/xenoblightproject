import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE } from '../config/palette';
import type { CharacterData } from '../data/CharacterData';
import type { PlayerController } from '../player/PlayerController';
import { textStyle } from './UITheme';

/**
 * World-space HUD: the name plate above the player. The screen-space HUD (status panel, minimap,
 * hotbar, ...) is `DungeonHud`, drawn by GameUIScene.
 */
export class GameHud {
  private readonly namePlate: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, character: CharacterData) {
    this.namePlate = scene.add
      .text(0, 0, character.name, textStyle(11, PALETTE.white, { stroke: PALETTE.black, strokeThickness: 3 }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.NamePlate);
  }

  update(player: PlayerController): void {
    const world = player.getWorldPosition();
    this.namePlate.setPosition(Math.round(world.x), Math.round(world.y - 62));
  }
}
