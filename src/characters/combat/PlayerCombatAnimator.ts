import Phaser from 'phaser';
import type { ActionDirection, Direction } from '../../core/Direction';
import type { PlayerAction, PlayerActionAnimations } from '../../player/PlayerController';
import { bodyNormalizeFor } from '../CharacterBodyMetrics';
import { CHARACTER_CANVAS_ROOT, CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH } from '../CharacterSheetLayout';
import type { CharacterView } from '../CharacterView';
import { playerCombatAnimKey, type PlayerCombatAction, type PlayerCombatSet } from './PlayerCombatArt';

/** 8-way facing -> the 4 combat facings (combat sheets have SE, SW, NE, NW). */
const FOUR_WAY: Record<Direction, ActionDirection> = { N: 'NE', NE: 'NE', E: 'SE', SE: 'SE', S: 'SW', SW: 'SW', W: 'NW', NW: 'NW' };

const CLIP_FOR: Partial<Record<PlayerAction, PlayerCombatAction>> = { attack: 'dagger_thrust', hit: 'hit_reaction', cast: 'self_heal_cast' };

/**
 * The player's combat clips on the character sprite (implements the PlayerController action hook):
 *   - combat_idle loops while in combat and standing,
 *   - dagger_thrust for attacks (basic and the Lv.1 skill), self_heal_cast for casts,
 *   - hit_reaction when hit - never cutting off an attack or a cast (the red flash still shows).
 * One-shots return to the combat stance. Walking hands the sprite back to the CharacterAnimator (walk
 * cycle), so the 8-direction walk / static art is untouched. Frames share the static canvas root (32, 57)
 * and the body scale of the appearance, so switching never moves or resizes the character.
 * Visual only: hit timing / damage are decided by the combat system, never by this playback.
 */
export class PlayerCombatAnimator implements PlayerActionAnimations {
  private acting: PlayerCombatAction | null = null;
  private stance = false;
  private facing: ActionDirection = 'SE';
  private inCombat = false;

  constructor(
    private readonly view: CharacterView,
    private readonly set: PlayerCombatSet,
  ) {
    view.sprite.on(Phaser.Animations.Events.ANIMATION_COMPLETE, this.onComplete, this);
  }

  play(action: PlayerAction, facing: ActionDirection): boolean {
    const clip = CLIP_FOR[action];
    if (!clip) return false;
    if (clip === 'hit_reaction' && this.acting && this.acting !== 'hit_reaction') return false;
    this.facing = facing;
    this.acting = clip;
    this.stance = false;
    this.show(clip);
    return true;
  }

  /** The clip playing now (null = none). */
  getActing(): PlayerCombatAction | null {
    return this.acting;
  }

  isInStance(): boolean {
    return this.stance;
  }

  /** Per frame: combat stance while in combat and standing; walking (or leaving combat) gives the sprite back. */
  update(inCombat: boolean, moving: boolean, facing: Direction): void {
    this.inCombat = inCombat;
    if (moving) {
      this.facing = FOUR_WAY[facing];
      if (this.acting || this.stance) this.release(); // an interrupted swing never finishes its clip
      return;
    }
    if (this.acting) return;
    if (inCombat && !this.stance) {
      this.stance = true;
      this.show('combat_idle');
    } else if (!inCombat && this.stance) {
      this.release();
    }
  }

  /** Stops every clip and hands the sprite back (death, respawn, interrupted attack). */
  reset(): void {
    this.release();
  }

  private show(clip: PlayerCombatAction): void {
    const sprite = this.view.sprite;
    this.view.animator.setHeld(true);
    const normalize = bodyNormalizeFor(this.view.getTextureKey()) ?? 1;
    sprite.setOrigin(CHARACTER_CANVAS_ROOT.x / CHARACTER_FRAME_WIDTH, CHARACTER_CANVAS_ROOT.y / CHARACTER_FRAME_HEIGHT);
    sprite.setScale(this.view.animator.getBaseScale() * normalize);
    sprite.play(playerCombatAnimKey(this.set, clip, this.facing));
  }

  private release(): void {
    this.acting = null;
    this.stance = false;
    if (this.view.animator.isHeld()) {
      this.view.sprite.stop();
      this.view.animator.setHeld(false);
    }
  }

  private onComplete(anim: Phaser.Animations.Animation): void {
    if (!this.acting || !anim.key.startsWith(`player.${this.set.key}.${this.acting}.`)) return;
    this.acting = null;
    if (this.inCombat) {
      this.stance = true;
      this.show('combat_idle');
    } else {
      this.release();
    }
  }
}
