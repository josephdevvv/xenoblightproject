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

/**
 * `touch`: the mobile version (DeviceMode) - several fingers at once (joystick + action buttons). `size`: the mobile
 * game size, shaped like the screen (MobileViewport); desktop keeps 960 x 480.
 */
export function createGameConfig(options: { touch?: boolean; size?: { width: number; height: number } } = {}): Phaser.Types.Core.GameConfig {
  return {
    // AUTO = WebGL when available, otherwise Phaser's Canvas renderer.
    type: Phaser.AUTO,
    parent: 'game-container',
    width: options.size?.width ?? GAME_WIDTH,
    height: options.size?.height ?? GAME_HEIGHT,
    backgroundColor: PALETTE.void,
    // Pixel art: nearest-neighbour filtering, no antialiasing, integer positions.
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      // the game size already has the window's / screen's shape (MobileViewport): ENVELOP covers it exactly - whole
      // game pixels cannot match every shape, so at most half a game pixel per edge is cut instead of a thin bar
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Mobile: the joystick and the action buttons are held at the same time (desktop keeps the one mouse pointer).
    input: { activePointers: options.touch ? 4 : 1 },
    // Needed for the HTML <input> used by the character name field.
    dom: {
      createContainer: true,
    },
    // Boot starts first; SystemScene is `active` and runs alongside everything; the overlay renders last (on top).
    scene: [BootScene, SystemScene, MainMenuScene, CharacterCreationScene, GameScene, GameUIScene, DebugOverlayScene, MonsterPreviewScene],
  };
}
