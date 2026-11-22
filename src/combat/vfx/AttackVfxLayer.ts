import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import type { Point } from '../../core/types';

/** Something an attack can hit: where its body is drawn right now. */
export interface VfxTarget {
  hitAnchor(): Point;
}

export interface AttackVfxRequest {
  texture: string;
  /** One-shot animation (repeat 0) of that texture. */
  anim: string;
  target: VfxTarget;
  scale?: number;
}

/**
 * The Attack VFX layer: every attack / on-hit effect is drawn ON its target's body, above every world
 * object and character sprite (DEPTH.AttackVfx) and below name plates and the UI. An effect follows its
 * target's hit anchor while it plays (target or camera moving), plays once at its own timing, then its
 * sprite goes back to a small pool (no leak, no per-hit allocation). Any number can play at once.
 */
export class AttackVfxLayer {
  private readonly active: { sprite: Phaser.GameObjects.Sprite; target: VfxTarget }[] = [];
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  private spawned = 0;

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(request: AttackVfxRequest): Phaser.GameObjects.Sprite | null {
    if (!this.scene.textures.exists(request.texture) || !this.scene.anims.exists(request.anim)) return null;
    const sprite = this.pool.pop() ?? this.create();
    const entry = { sprite, target: request.target };
    this.active.push(entry);
    this.spawned++;
    sprite.setTexture(request.texture).setOrigin(0.5, 0.5).setScale(request.scale ?? 1).setAlpha(1).setVisible(true).setActive(true);
    this.place(entry);
    sprite.play(request.anim);
    return sprite;
  }

  /** Every frame: keep each effect on its target's body. */
  update(): void {
    for (const entry of this.active) this.place(entry);
  }

  /** Effects playing now (for checks). */
  get activeCount(): number {
    return this.active.length;
  }

  /** Sprites ever created (pool size) and effects ever spawned (for checks). */
  get stats(): { created: number; spawned: number; pooled: number } {
    return { created: this.active.length + this.pool.length, spawned: this.spawned, pooled: this.pool.length };
  }

  /** Ends every effect now (its sprite goes back to the pool). */
  clear(): void {
    for (const e of [...this.active]) this.release(e.sprite);
  }

  /** Scene shutdown: Phaser destroys the sprites itself (some already are) - only forget them. */
  dispose(): void {
    this.active.length = 0;
    this.pool.length = 0;
  }

  private create(): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(0, 0, '__DEFAULT').setDepth(DEPTH.AttackVfx).setVisible(false);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(sprite));
    return sprite;
  }

  private place(entry: { sprite: Phaser.GameObjects.Sprite; target: VfxTarget }): void {
    const p = entry.target.hitAnchor();
    entry.sprite.setPosition(Math.round(p.x), Math.round(p.y));
  }

  private release(sprite: Phaser.GameObjects.Sprite): void {
    const i = this.active.findIndex((e) => e.sprite === sprite);
    if (i < 0) return;
    this.active.splice(i, 1);
    sprite.stop();
    sprite.setVisible(false).setActive(false);
    this.pool.push(sprite);
  }
}
