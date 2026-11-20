import type Phaser from 'phaser';
import { DIRECTIONS, type Direction } from '../core/Direction';
import {
  CHARACTER_DISPLAY_HEIGHT,
  CHARACTER_FRAME_HEIGHT,
  CHARACTER_FRAME_WIDTH,
  CHARACTER_ORIGIN,
  CHARACTER_WALK_LAYOUT,
  characterFrameIndex,
} from './CharacterSheetLayout';
import { bodyNormalizeFor } from './CharacterBodyMetrics';
import { getSheetMetrics, type FrameBounds } from './SpriteMetrics';

export type CharacterMotion = 'stand' | 'walk';

export interface CharacterSheets {
  /** Standing sheet: 8 static directional frames (always present). */
  standing: string;
  /** Walk-cycle sheet, or null when the appearance has no walk art (it then stays static while moving). */
  walk: string | null;
}

/** Sprite origin + size normalisation for one displayed frame / walk row. */
interface Placement {
  originX: number;
  originY: number;
  /** Multiplier that brings the figure to CHARACTER_DISPLAY_HEIGHT. */
  normalize: number;
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
 * Every sheet is measured (SpriteMetrics) and displayed so that, whatever the art:
 *   - the feet sit exactly on the world position (no jumping between appearances or directions),
 *   - the figure is CHARACTER_DISPLAY_HEIGHT tall (all appearances, standing and walking, same size).
 * Scaling uses the game's nearest-neighbour filtering, so sprites stay sharp.
 */
export class CharacterAnimator {
  private sheets: CharacterSheets;
  private motion: CharacterMotion = 'stand';
  private direction: Direction = 'S';
  /** Extra uniform scale requested by the owner (e.g. 3 for the creation preview). */
  private baseScale = 1;

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

  /** Uniform display scale on top of the size normalisation. */
  setBaseScale(scale: number): void {
    this.baseScale = scale;
    this.apply(true);
  }

  getSheets(): CharacterSheets {
    return this.sheets;
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

    this.place(this.walkPlacement(walkTexture));
    this.sprite.play({ key, startFrame });
  }

  private showStanding(): void {
    if (this.sprite.anims.isPlaying) this.sprite.stop();
    const index = characterFrameIndex(this.direction);
    this.sprite.setTexture(this.sheets.standing, index);
    this.place(this.standingPlacement(index));
  }

  private place(p: Placement): void {
    this.sprite.setOrigin(p.originX, p.originY);
    this.sprite.setScale(this.baseScale * p.normalize);
  }

  /**
   * Standing: anchor this frame on its own feet. Size: the body master's scale (same for every
   * hairstyle / outfit and for the walk sheet), else the sheet's front (S) frame height.
   */
  private standingPlacement(index: number): Placement {
    const metrics = getSheetMetrics(this.sprite.scene.textures, this.sheets.standing);
    const frame = metrics[index];
    const reference = metrics[characterFrameIndex('S')] ?? frame;
    return {
      originX: frame ? frame.feetX / CHARACTER_FRAME_WIDTH : CHARACTER_ORIGIN.x,
      // Bottom EDGE of the lowest foot row, so the soles land exactly on the anchor at any scale.
      originY: frame ? (frame.bottom + 1) / CHARACTER_FRAME_HEIGHT : CHARACTER_ORIGIN.y,
      normalize: bodyNormalizeFor(this.sheets.standing) ?? (reference ? CHARACTER_DISPLAY_HEIGHT / reference.height : 1),
    };
  }

  /**
   * Walking: one anchor per direction row (average feet centre, lowest contact row) so the stride
   * animates in place without sliding. Size: the body master's scale (identical to standing), else
   * the median height of the S walk row.
   */
  private walkPlacement(walkTexture: string): Placement {
    const metrics = getSheetMetrics(this.sprite.scene.textures, walkTexture);
    const { columns, rows } = CHARACTER_WALK_LAYOUT;
    const rowFrames = (direction: Direction): FrameBounds[] =>
      metrics.slice(rows[direction] * columns, rows[direction] * columns + columns).filter((f): f is FrameBounds => f !== null);
    const row = rowFrames(this.direction);
    const front = rowFrames('S').map((f) => f.height).sort((a, b) => a - b);
    const referenceHeight = front.length > 0 ? front[Math.floor(front.length / 2)] : CHARACTER_DISPLAY_HEIGHT;
    const bodyScale = bodyNormalizeFor(walkTexture);
    if (row.length === 0) {
      return { originX: CHARACTER_WALK_LAYOUT.origin.x, originY: CHARACTER_WALK_LAYOUT.origin.y, normalize: bodyScale ?? 1 };
    }
    const feetX = row.reduce((sum, f) => sum + f.feetX, 0) / row.length;
    const bottom = Math.max(...row.map((f) => f.bottom));
    return {
      originX: feetX / CHARACTER_FRAME_WIDTH,
      originY: (bottom + 1) / CHARACTER_FRAME_HEIGHT,
      normalize: bodyScale ?? CHARACTER_DISPLAY_HEIGHT / referenceHeight,
    };
  }
}
