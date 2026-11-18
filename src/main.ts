import Phaser from 'phaser';
import { createGameConfig } from './config/GameConfig';

const game = new Phaser.Game(createGameConfig());

// Development hook for debugging / automated browser checks. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __XENOBLIGHT__: Phaser.Game }).__XENOBLIGHT__ = game;
}
