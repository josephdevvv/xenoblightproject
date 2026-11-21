import Phaser from 'phaser';
import {
  HIT_TINT,
  MONSTER_ART,
  monsterAnimKey,
  monsterSheetKey,
  type MonsterAction,
  type MonsterArtId,
  type MonsterFacing,
} from './art/MonsterArt';

/**
 * Plays a monster's sprite animations: a looping base state (idle / walk) by facing, one-shot actions
 * (attack - its hit frame is reported to the combat system, which draws the monster's VFX ON the target
 * (AttackVfxLayer) when the hit connects -, hit reaction with a red flash, death held on its last frame).
 *
 * The sprite is always positioned on the monster's ground root; each action/facing sets the origin to
 * that sheet's measured anchor, so switching animations never moves the creature on the ground.
 * Visual only - the future combat system decides WHEN to call attack / hit / die.
 */
export class MonsterAnimator {
  readonly sprite: Phaser.GameObjects.Sprite;
  private facing: MonsterFacing;
  private action: MonsterAction = 'idle';
  private walking = false;
  private oneShot: MonsterAction | null = null;
  private dead = false;
  private onOneShotDone: (() => void) | null = null;
  /** Called once on the attack's hit frame (global rule: frame 4): the combat system resolves the hit. */
  private onContact: (() => void) | null = null;
  private flashTimer: Phaser.Time.TimerEvent | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly art: MonsterArtId,
    facing: MonsterFacing,
  ) {
    this.facing = facing;
    this.sprite = scene.add.sprite(0, 0, monsterSheetKey(art, 'idle'));
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, this.onFrame, this);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onComplete, this);
    this.play('idle');
  }

  getFacing(): MonsterFacing {
    return this.facing;
  }

  getAction(): MonsterAction {
    return this.action;
  }

  isDead(): boolean {
    return this.dead;
  }

  /** Base state from movement. Ignored while a one-shot plays or after death. */
  setMotion(walking: boolean, facing: MonsterFacing = this.facing): void {
    const changed = walking !== this.walking || facing !== this.facing;
    this.walking = walking;
    this.facing = facing;
    if (this.dead || this.oneShot || !changed) return;
    this.play(walking ? 'walk' : 'idle');
  }

  /**
   * Attack once. `onContact` runs once on the hit frame (frame 4) - the combat system resolves the hit
   * there; `done` when the animation ends. An interrupted attack never lands.
   */
  attack(done?: () => void, onContact?: () => void): void {
    if (this.dead) return;
    this.onContact = onContact ?? null;
    this.startOneShot('attack', done);
  }

  /** True while an attack animation plays (a hit then only flashes, so the attack still lands). */
  isAttacking(): boolean {
    return this.oneShot === 'attack';
  }

  /** Brief red flash without changing the animation (damage taken mid-attack). */
  flash(ms = 140): void {
    if (this.dead) return;
    this.sprite.setTint(HIT_TINT);
    this.flashTimer?.remove();
    this.flashTimer = this.sprite.scene.time.delayedCall(ms, () => {
      if (this.action !== 'hit') this.sprite.clearTint();
    });
  }

  /** Short recoil with a red flash on the configured frames. */
  hit(done?: () => void): void {
    this.startOneShot('hit', done);
  }

  /** Death: plays once and stays on the last frame. Final - no other animation plays afterwards. */
  die(done?: () => void): void {
    if (this.dead) return;
    this.dead = true;
    this.sprite.clearTint();
    this.startOneShot('death', done, true);
  }

  /** Back to life (preview / respawn): clears death and returns to the base state. */
  reset(): void {
    this.dead = false;
    this.oneShot = null;
    this.sprite.clearTint();
    this.play(this.walking ? 'walk' : 'idle');
  }

  /** Puts the sprite on the ground root (whole pixels) at a depth. */
  setRoot(x: number, y: number, depth: number): void {
    this.sprite.setPosition(x, y).setDepth(depth);
  }

  destroy(): void {
    this.flashTimer?.remove();
    this.sprite.destroy();
  }

  // ---------------------------------------------------------------------------------------------

  private startOneShot(action: MonsterAction, done?: () => void, force = false): void {
    if (this.dead && !force) return;
    if (action !== 'attack') this.onContact = null; // an interrupted attack never lands
    this.oneShot = action;
    this.onOneShotDone = done ?? null;
    this.play(action);
  }

  private play(action: MonsterAction): void {
    this.action = action;
    const meta = MONSTER_ART[this.art].meta.actions[action];
    const a = meta.anchors[this.facing];
    this.sprite.setOrigin(a.x / meta.frameWidth, a.y / meta.frameHeight);
    this.sprite.clearTint();
    // restart one-shots (a second hit while recoiling replays it); loops keep running
    this.sprite.play(monsterAnimKey(this.art, action, this.facing), action === 'idle' || action === 'walk');
    // ANIMATION_UPDATE only fires on frame CHANGES: apply the first frame's effects (red flash) here
    const first = this.sprite.anims.currentFrame;
    if (first) this.onFrame(this.sprite.anims.currentAnim!, first);
  }

  private onFrame(_anim: Phaser.Animations.Animation, frame: Phaser.Animations.AnimationFrame): void {
    const art = MONSTER_ART[this.art];
    const n = frame.index; // 1-based
    if (this.action === 'hit') {
      if ((art.hitTintFrames as readonly number[]).includes(n)) this.sprite.setTint(HIT_TINT);
      else this.sprite.clearTint();
    }
    if (this.action === 'attack' && n === art.impactFrame) {
      const contact = this.onContact;
      this.onContact = null; // once per attack: no duplicate damage
      contact?.();
    }
  }

  private onComplete(anim: Phaser.Animations.Animation): void {
    if (!anim.key.startsWith(`monster.${this.art}.`) || anim.repeat === -1) return;
    const done = this.onOneShotDone;
    this.onOneShotDone = null;
    this.sprite.clearTint();
    if (this.action === 'death') {
      this.oneShot = null; // stays on the last frame
    } else {
      this.oneShot = null;
      this.play(this.walking ? 'walk' : 'idle');
    }
    done?.();
  }
}
