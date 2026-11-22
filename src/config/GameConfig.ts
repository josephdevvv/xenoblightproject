import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './constants';
import { PALETTE } from './palette';
import { BootScene } from '../scenes/BootScene';
import { CharacterCreationScene } from '../scenes/CharacterCreationScene';
import { DebugOverlayScene } from '../scenes/DebugOverlayScene';
import { GameScene } from '../scenes/GameScene';
import { GameUIScene } from '../scenes/GameUIScene';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { MonsterPreviewScene } from '../scenes/MonsterPreviewScene';
import { SystemScene } from '../scenes/SystemScene';

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
    // Boot starts first; SystemScene is `active` and runs alongside everything; the overlay renders last (on top).
    scene: [BootScene, SystemScene, MainMenuScene, CharacterCreationScene, GameScene, GameUIScene, DebugOverlayScene, MonsterPreviewScene],
  };
}
