import Phaser from 'phaser';
import { AssetManager } from '../assets/AssetManager';
import type { CharacterAppearance } from '../data/CharacterData';
import { CharacterAnimator, type CharacterSheets } from './CharacterAnimator';

/**
 * Character rendering: ONE sprite showing ONE complete pre-rendered sheet at a time
 * (standing sheet when still, walk sheet while moving). No body/hair/outfit layers.
 */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly animator: CharacterAnimator;
  private textureKey: string;

  constructor(scene: Phaser.Scene, appearance: CharacterAppearance, x: number, y: number) {
    const sheets = CharacterView.resolveSheets(scene, appearance);
    this.textureKey = sheets.standing;
    this.sprite = scene.add.sprite(x, y, sheets.standing, 0);
    this.animator = new CharacterAnimator(this.sprite, sheets);
  }

  /** Texture key of the standing sheet (the appearance's sprite ID). */
  getTextureKey(): string {
    return this.textureKey;
  }

  setAppearance(appearance: CharacterAppearance): void {
    const sheets = CharacterView.resolveSheets(this.sprite.scene, appearance);
    if (sheets.standing === this.textureKey) return;
    this.textureKey = sheets.standing;
    this.animator.setSheets(sheets);
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

  private static resolveSheets(scene: Phaser.Scene, appearance: CharacterAppearance): CharacterSheets {
    return {
      standing: AssetManager.ensureCharacterTexture(scene, appearance),
      walk: AssetManager.getWalkTexture(scene, appearance),
    };
  }
}
