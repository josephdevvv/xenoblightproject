import Phaser from 'phaser';
import { DEPTH } from '../../config/constants';
import type { ActionDirection } from '../../core/Direction';
import { skillVfxAnimKey, skillVfxOrigin, type SkillVfxArt, type SkillVfxGender } from '../../characters/combat/SkillVfxArt';

/** The character a skill VFX is drawn on. */
export interface SkillVfxAttacker {
  /** The character sprite now (position = ground root, scale = the clip's drawn scale). */
  sprite(): Phaser.GameObjects.Sprite;
  /** Its attack clip is still playing (a walk or a death ends the swing - and the effect with it). */
  stillSwinging(): boolean;
}

export interface SkillVfxRequest {
  art: SkillVfxArt;
  facing: ActionDirection;
  gender: SkillVfxGender;
  /** The swing's ASPD playback speed (the effect keeps time with it). */
  speed: number;
}

/**
 * Skill VFX on the attacker (the Drifter's red stab): a separate sprite above every character (DEPTH.AttackVfx), on
 * the character's ground root with the art's per-facing offset (SkillVfxArt), following the character while it plays
 * once; then its sprite goes back to a small pool. It never takes input and has no body. A swing that stops (the player
 * walks off, dies) ends its effect at once; clear() ends them all (death, respawn); dispose() on scene shutdown.
 */
export class SkillVfxLayer {
  private readonly active: { sprite: Phaser.GameObjects.Sprite; request: SkillVfxRequest }[] = [];
  private readonly pool: Phaser.GameObjects.Sprite[] = [];
  private spawned = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly attacker: SkillVfxAttacker,
  ) {}

  /** Starts one effect now (null when its art is not loaded, or the swing already stopped). */
  spawn(request: SkillVfxRequest): Phaser.GameObjects.Sprite | null {
    const anim = skillVfxAnimKey(request.art, request.facing);
    if (!this.attacker.stillSwinging() || !this.scene.textures.exists(request.art.key) || !this.scene.anims.exists(anim)) return null;
    const sprite = this.pool.pop() ?? this.create();
    const entry = { sprite, request };
    this.active.push(entry);
    this.spawned++;
    const origin = skillVfxOrigin(request.art, request.gender, request.facing);
    sprite.setTexture(request.art.key).setOrigin(origin.x, origin.y).setAlpha(1).setVisible(true).setActive(true);
    this.place(entry);
    sprite.play({ key: anim, timeScale: request.speed > 0 ? request.speed : 1 });
    return sprite;
  }

  /** Every frame: on the character; a stopped swing ends its effect. */
  update(): void {
    if (!this.active.length) return;
    if (!this.attacker.stillSwinging()) {
      this.clear();
      return;
    }
    for (const entry of this.active) this.place(entry);
  }

  get activeCount(): number {
    return this.active.length;
  }

  get stats(): { created: number; spawned: number; pooled: number } {
    return { created: this.active.length + this.pool.length, spawned: this.spawned, pooled: this.pool.length };
  }

  /** Ends every effect now. */
  clear(): void {
    for (const e of [...this.active]) this.release(e.sprite);
  }

  /** Scene shutdown: Phaser destroys the sprites itself - only forget them. */
  dispose(): void {
    this.active.length = 0;
    this.pool.length = 0;
  }

  private create(): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(0, 0, '__DEFAULT').setDepth(DEPTH.AttackVfx).setVisible(false);
    sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(sprite));
    return sprite;
  }

  private place(entry: { sprite: Phaser.GameObjects.Sprite }): void {
    const body = this.attacker.sprite();
    entry.sprite.setPosition(body.x, body.y).setScale(Math.abs(body.scaleX), Math.abs(body.scaleY));
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
