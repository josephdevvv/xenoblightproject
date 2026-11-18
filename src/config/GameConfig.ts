import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { PALETTE } from './palette';
import { BootScene } from '../scenes/BootScene';
import { CharacterCreationScene } from '../scenes/CharacterCreationScene';
import { GameScene } from '../scenes/GameScene';

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    // AUTO = WebGL when available, otherwise Phaser's Canvas renderer.
    type: Phaser.AUTO,
    parent: 'game-container',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: PALETTE.void,
    // Pixel art: nearest-neighbour filtering, no antialiasing, integer positions.
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Needed for the HTML <input> used by the character name field.
    dom: {
      createContainer: true,
    },
    scene: [BootScene, CharacterCreationScene, GameScene],
  };
}
