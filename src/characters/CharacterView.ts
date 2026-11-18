import Phaser from 'phaser';
import { AssetManager } from '../assets/AssetManager';
import type { CharacterAppearance } from '../data/CharacterData';
import { CHARACTER_ORIGIN } from './CharacterSheetLayout';
import { DirectionalFrameController } from './DirectionalFrameController';

/**
 * Character rendering: ONE sprite showing ONE complete pre-rendered sheet.
 * Changing appearance swaps the whole sheet; there are no body/hair/outfit layers.
 */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly facing: DirectionalFrameController;
  private textureKey: string;

  constructor(scene: Phaser.Scene, appearance: CharacterAppearance, x: number, y: number) {
    this.textureKey = AssetManager.ensureCharacterTexture(scene, appearance);
    this.sprite = scene.add.sprite(x, y, this.textureKey, 0);
    this.sprite.setOrigin(CHARACTER_ORIGIN.x, CHARACTER_ORIGIN.y);
    this.facing = new DirectionalFrameController(this.sprite);
  }

  getTextureKey(): string {
    return this.textureKey;
  }

  setAppearance(appearance: CharacterAppearance): void {
    const key = AssetManager.ensureCharacterTexture(this.sprite.scene, appearance);
    if (key === this.textureKey) return;
    this.textureKey = key;
    this.sprite.setTexture(key);
    this.facing.apply();
  }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
  }

  setDepth(depth: number): void {
    this.sprite.setDepth(depth);
  }

  setScale(scale: number): void {
    this.sprite.setScale(scale);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
