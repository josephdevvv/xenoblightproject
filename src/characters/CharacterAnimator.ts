import type Phaser from 'phaser';
import { DIRECTIONS, type Direction } from '../core/Direction';
import { CHARACTER_ORIGIN, CHARACTER_WALK_LAYOUT, characterFrameIndex } from './CharacterSheetLayout';

export type CharacterMotion = 'stand' | 'walk';

export interface CharacterSheets {
  /** Standing sheet: 8 static directional frames (always present). */
  standing: string;
  /** Walk-cycle sheet, or null when the appearance has no walk art (it then stays static while moving). */
  walk: string | null;
  /**
   * Vertical origin (0..1) that puts this standing sheet's feet on the ground point.
   * Comes from the manifest's measured standingFeetY; defaults to CHARACTER_ORIGIN.y (58/64).
   */
  standingOriginY?: number;
}

export function walkAnimationKey(walkTexture: string, direction: Direction): string {
  return `${walkTexture}::walk::${direction}`;
}

/** Registers one looping walk clip per direction for a walk sheet (idempotent). */
export function registerWalkAnimations(anims: Phaser.Animations.AnimationManager, walkTexture: string): void {
  const { columns, frameRate, rows } = CHARACTER_WALK_LAYOUT;
  for (const direction of DIRECTIONS) {
    const key = walkAnimationKey(walkTexture, direction);
    if (anims.exists(key)) continue;
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let col = 0; col < columns; col++) {
      frames.push({ key: walkTexture, frame: rows[direction] * columns + col });
    }
    anims.create({ key, frames, frameRate, repeat: -1 });
  }
}

/** Removes a walk sheet's clips (called when the sheet is evicted from the cache). */
export function removeWalkAnimations(anims: Phaser.Animations.AnimationManager, walkTexture: string): void {
  for (const direction of DIRECTIONS) anims.remove(walkAnimationKey(walkTexture, direction));
}

/**
 * Decides what the character sprite shows. Knows nothing about input or movement.
 *
 *   - stand: the static directional frame from the standing sheet (no idle animation, ever)
 *   - walk:  the looping walk clip for the direction, if the appearance has walk art
 *
 * Each sheet has its own feet origin so the character's feet stay on the same ground point
 * when switching between them.
 */
export class CharacterAnimator {
  private sheets: CharacterSheets;
  private motion: CharacterMotion = 'stand';
  private direction: Direction = 'S';

  constructor(
    private readonly sprite: Phaser.GameObjects.Sprite,
    sheets: CharacterSheets,
  ) {
    this.sheets = sheets;
    if (sheets.walk) registerWalkAnimations(sprite.scene.anims, sheets.walk);
    this.showStanding();
  }

  /** Swap sheets (appearance change) and re-apply the current motion/direction. */
  setSheets(sheets: CharacterSheets): void {
    this.sheets = sheets;
    if (sheets.walk) registerWalkAnimations(this.sprite.scene.anims, sheets.walk);
    this.sprite.stop();
    this.apply(true);
  }

  setMotion(motion: CharacterMotion, direction: Direction): void {
    if (motion === this.motion && direction === this.direction) return;
    this.motion = motion;
    this.direction = direction;
    this.apply(false);
  }

  getMotion(): CharacterMotion {
    return this.motion;
  }

  getDirection(): Direction {
    return this.direction;
  }

  private apply(force: boolean): void {
    if (this.motion === 'walk' && this.sheets.walk) {
      this.showWalk(this.sheets.walk, force);
    } else {
      this.showStanding();
    }
  }

  private showWalk(walkTexture: string, force: boolean): void {
    const key = walkAnimationKey(walkTexture, this.direction);
    const anims = this.sprite.anims;
    if (!force && anims.isPlaying && anims.currentAnim?.key === key) return;

    // Changing direction mid-stride keeps the stride phase (AnimationFrame.index is 1-based).
    const wasWalking = anims.isPlaying && anims.currentAnim?.key.startsWith(`${walkTexture}::walk::`);
    const startFrame = wasWalking && anims.currentFrame ? anims.currentFrame.index - 1 : 0;

    this.sprite.setOrigin(CHARACTER_WALK_LAYOUT.origin.x, CHARACTER_WALK_LAYOUT.origin.y);
    this.sprite.play({ key, startFrame });
  }

  private showStanding(): void {
    if (this.sprite.anims.isPlaying) this.sprite.stop();
    this.sprite.setTexture(this.sheets.standing, characterFrameIndex(this.direction));
    this.sprite.setOrigin(CHARACTER_ORIGIN.x, this.sheets.standingOriginY ?? CHARACTER_ORIGIN.y);
  }
}
