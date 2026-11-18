import Phaser from 'phaser';
import { DEPTH } from '../config/constants';
import { PALETTE } from '../config/palette';
import type { CharacterData } from '../data/CharacterData';
import type { PlayerController } from '../player/PlayerController';
import { createPanel } from './Panel';
import { textStyle } from './UITheme';

/** Minimal in-game HUD: name plate above the player plus a small info panel. */
export class GameHud {
  private readonly namePlate: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, character: CharacterData, mapName: string) {
    this.namePlate = scene.add
      .text(0, 0, character.name, textStyle(11, PALETTE.white, { stroke: PALETTE.black, strokeThickness: 3 }))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.NamePlate);

    const panel = createPanel(scene, 12, 12, 250, 74);
    panel.add([
      scene.add.text(14, 10, character.name.toUpperCase(), textStyle(13, PALETTE.white, { letterSpacing: 1 })),
      scene.add.text(14, 28, mapName, textStyle(10, PALETTE.silver)),
    ]);
    this.statusText = scene.add.text(14, 46, '', textStyle(10, PALETTE.gray));
    panel.add(this.statusText);
    panel.setScrollFactor(0).setDepth(DEPTH.Hud);

    scene.add
      .text(scene.scale.width - 14, scene.scale.height - 12, 'WASD  Move     ESC  Character Creation', textStyle(10, PALETTE.gray))
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.Hud);
  }

  update(player: PlayerController): void {
    const world = player.getWorldPosition();
    this.namePlate.setPosition(Math.round(world.x), Math.round(world.y - 56));
    const tile = player.getTilePosition();
    this.statusText.setText(
      `Tile ${Math.floor(tile.x)},${Math.floor(tile.y)}   Facing ${player.getFacing()}   ${player.getState().toUpperCase()}`,
    );
  }
}
