import type Phaser from 'phaser';
import { GameCursor } from '../cursor/GameCursor';

/**
 * The monster target cursor (art-source/ui/cursor/monster_target_cursor.png, as delivered): a 48 x 14
 * sheet of three 16 x 14 frames - a sword pointing up-left.
 *   frame 1: hovering a monster
 *   frame 2: left button pressed on a monster
 *   frame 3: released over the monster (shown briefly, then back to frame 1 - never looped)
 * Each frame becomes a native CSS cursor (no input lag), scaled x2 with nearest neighbour to match the
 * game's pixel size. The hotspot is the blade tip, pixel (4, 3) of every frame. It takes the cursor over
 * from the game cursor (GameCursor.setOverride) and gives it back when the pointer leaves the monster.
 */
export const MONSTER_CURSOR = {
  key: 'ui_cursor_monster_target',
  url: 'assets/ui/cursor/monster_target_cursor.png',
  frameWidth: 16,
  frameHeight: 14,
  frames: 3,
  hotspot: { x: 4, y: 3 },
  scale: 2,
  /** How long the release frame stays before returning to the hover frame. */
  releaseMs: 140,
} as const;

export type MonsterCursorState = 'none' | 'hover' | 'press' | 'release';

/** Cursor for the monster hover / press / release states; 'none' gives the cursor back to the game cursor. */
export class MonsterCursor {
  private readonly cursors: string[] = [];
  private state: MonsterCursorState = 'none';
  private releaseLeftMs = 0;

  constructor(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists(MONSTER_CURSOR.key)) return; // art failed to load: the normal cursor stays
    const source = textures.get(MONSTER_CURSOR.key).getSourceImage() as CanvasImageSource;
    const { frameWidth: w, frameHeight: h, scale: k, hotspot } = MONSTER_CURSOR;
    for (let f = 0; f < MONSTER_CURSOR.frames; f++) {
      const c = document.createElement('canvas');
      c.width = w * k;
      c.height = h * k;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false; // crisp pixels, alpha untouched
      ctx.drawImage(source, f * w, 0, w, h, 0, 0, w * k, h * k);
      this.cursors.push(`url(${c.toDataURL('image/png')}) ${hotspot.x * k} ${hotspot.y * k}, auto`);
    }
  }

  getState(): MonsterCursorState {
    return this.state;
  }

  /** Every frame: is a monster under the pointer (and not UI)? */
  update(deltaMs: number, overMonster: boolean): void {
    if (!overMonster) {
      this.set('none');
      return;
    }
    if (this.state === 'none') this.set('hover');
    if (this.state === 'release') {
      this.releaseLeftMs -= deltaMs;
      if (this.releaseLeftMs <= 0) this.set('hover');
    }
  }

  /** Left button went down on a monster. */
  press(): void {
    this.set('press');
  }

  /** Left button released; `overMonster` = still over a monster. */
  release(overMonster: boolean): void {
    if (this.state !== 'press') return;
    if (!overMonster) {
      this.set('none');
      return;
    }
    this.releaseLeftMs = MONSTER_CURSOR.releaseMs;
    this.set('release');
  }

  /** Pointer left the game / scene shuts down. */
  reset(): void {
    this.set('none');
  }

  private set(state: MonsterCursorState): void {
    if (state === this.state) return;
    this.state = state;
    if (!this.cursors.length) return;
    const frame = state === 'hover' ? 0 : state === 'press' ? 1 : state === 'release' ? 2 : -1;
    GameCursor.setOverride(frame < 0 ? null : this.cursors[frame]);
  }
}
