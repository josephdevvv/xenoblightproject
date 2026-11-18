import Phaser from 'phaser';
import { AssetManager } from '../assets/AssetManager';
import type { CharacterAppearance } from '../data/CharacterData';
import { GameServices } from '../systems/GameServices';
import { CharacterAnimator, type CharacterSheets } from './CharacterAnimator';

export interface CharacterViewOptions {
  /** Load and use the walk-cycle sheet (default true). The creation preview passes false. */
  walk?: boolean;
}

let nextViewId = 1;

/**
 * Character rendering: ONE sprite showing ONE complete pre-rendered sheet at a time
 * (standing sheet when still, walk sheet while moving). No body/hair/outfit layers.
 *
 * The view holds cache references to the sheets it shows, so they are never evicted while it
 * lives, and releases them when the sprite is destroyed (e.g. scene shutdown).
 * Scenes normally preload the sheets with AssetManager.ensureCharacterSheets(); if they are not
 * loaded yet, a mockup placeholder is shown and swapped as soon as the real art arrives.
 */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly animator: CharacterAnimator;
  private readonly owner = `character-view:${nextViewId++}`;
  private readonly walk: boolean;
  private sheets: CharacterSheets;
  private request = 0;

  constructor(scene: Phaser.Scene, appearance: CharacterAppearance, x: number, y: number, options: CharacterViewOptions = {}) {
    this.walk = options.walk ?? true;
    const ready = AssetManager.peekCharacterSheets(scene, appearance, { walk: this.walk });
    this.sheets = ready ?? AssetManager.placeholderSheets(scene, appearance);
    this.retain(this.sheets);

    this.sprite = scene.add.sprite(x, y, this.sheets.standing, 0);
    this.animator = new CharacterAnimator(this.sprite, this.sheets);

    const services = GameServices.get();
    services.characters.add(this);
    this.sprite.once(Phaser.GameObjects.Events.DESTROY, () => {
      services.cache.releaseOwner(this.owner);
      services.characters.remove(this);
    });

    if (!ready) this.setAppearance(appearance);
  }

  /** Texture key of the standing sheet currently shown. */
  getTextureKey(): string {
    return this.sheets.standing;
  }

  /** Switches to another appearance; loads its art on demand without flashing in between. */
  setAppearance(appearance: CharacterAppearance): void {
    const request = ++this.request;
    const scene = this.sprite.scene;
    const ready = AssetManager.peekCharacterSheets(scene, appearance, { walk: this.walk });
    if (ready) {
      this.applySheets(ready);
      return;
    }
    void AssetManager.ensureCharacterSheets(scene, appearance, { walk: this.walk }).then((sheets) => {
      if (request === this.request && this.sprite.active) this.applySheets(sheets);
    });
  }

  setPosition(x: number, y: number): void {
    this.sprite.setPosition(x, y);
  }

  setDepth(depth: number): void {
    this.sprite.setDepth(depth);
  }

  /** Uniform display scale (e.g. 3 for the creation preview); size normalisation is applied on top. */
  setScale(scale: number): void {
    this.animator.setBaseScale(scale);
  }

  destroy(): void {
    this.sprite.destroy();
  }

  private applySheets(sheets: CharacterSheets): void {
    if (sheets.standing === this.sheets.standing && sheets.walk === this.sheets.walk) return;
    const previous = this.sheets;
    this.retain(sheets);
    this.sheets = sheets;
    this.animator.setSheets(sheets);
    this.release(previous);
  }

  private retain(sheets: CharacterSheets): void {
    const cache = GameServices.get().cache;
    cache.retain(sheets.standing, this.owner);
    if (sheets.walk) cache.retain(sheets.walk, this.owner);
  }

  private release(sheets: CharacterSheets): void {
    const cache = GameServices.get().cache;
    if (sheets.standing !== this.sheets.standing) cache.release(sheets.standing, this.owner);
    if (sheets.walk && sheets.walk !== this.sheets.walk) cache.release(sheets.walk, this.owner);
  }
}
