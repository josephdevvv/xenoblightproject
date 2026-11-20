import Phaser from 'phaser';
import { AssetManager } from '../assets/AssetManager';
import type { CharacterAppearance } from '../data/CharacterData';
import { GameServices } from '../systems/GameServices';
import { approvedPlacement, CharacterAnimator, namePlateHeight, type CharacterSheets } from './CharacterAnimator';
import { characterFrameIndex } from './CharacterSheetLayout';
import { getSheetMetrics } from './SpriteMetrics';

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
 *
 * Positions: the view keeps the exact world position (movement is never rounded) but DRAWS at whole
 * pixels - rounded to the world for ordinary characters, or a camera-stable position for the
 * followed player (setRenderPosition). Anything attached to a character (name plate) uses
 * getRenderRoot(), so both share one integer root and cannot drift apart by a pixel.
 */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly animator: CharacterAnimator;
  private readonly owner = `character-view:${nextViewId++}`;
  private readonly walk: boolean;
  private sheets: CharacterSheets;
  private request = 0;
  private readonly world = { x: 0, y: 0 };
  private namePlateCache: { texture: string; scale: number; height: number } | null = null;

  constructor(scene: Phaser.Scene, appearance: CharacterAppearance, x: number, y: number, options: CharacterViewOptions = {}) {
    this.walk = options.walk ?? true;
    const ready = AssetManager.peekCharacterSheets(scene, appearance, { walk: this.walk });
    this.sheets = ready ?? AssetManager.placeholderSheets(scene, appearance);
    this.retain(this.sheets);

    this.world.x = x;
    this.world.y = y;
    this.sprite = scene.add.sprite(Math.round(x), Math.round(y), this.sheets.standing, 0);
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

  /** Exact world position (feet). Drawn at the nearest whole pixel. */
  setPosition(x: number, y: number): void {
    this.world.x = x;
    this.world.y = y;
    this.sprite.setPosition(Math.round(x), Math.round(y));
  }

  /** Overrides the drawn position (whole pixels), e.g. the camera-stable position of the followed player. */
  setRenderPosition(x: number, y: number): void {
    this.sprite.setPosition(Math.round(x), Math.round(y));
  }

  getWorldPosition(): { x: number; y: number } {
    return { ...this.world };
  }

  /** Where the character is drawn (integer feet root). Attach labels / effects here. */
  getRenderRoot(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /**
   * Name plate height above the feet (whole px): fixed per appearance - top of the front (S) static
   * frame + a small gap - and NEVER taken from the animated frame, so the label does not bounce with
   * the walk cycle. Cached until the appearance or display scale changes.
   */
  getNamePlateHeight(): number {
    const texture = this.sheets.standing;
    const scale = this.animator.getBaseScale();
    if (this.namePlateCache && this.namePlateCache.texture === texture && this.namePlateCache.scale === scale) return this.namePlateCache.height;
    const placement = approvedPlacement(texture);
    const front = placement ? getSheetMetrics(this.sprite.scene.textures, texture)[characterFrameIndex('S')] : undefined;
    const height = namePlateHeight(front ? front.top : null, placement ? placement.normalize : null, scale);
    this.namePlateCache = { texture, scale, height };
    return height;
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
