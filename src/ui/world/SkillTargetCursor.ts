import type Phaser from 'phaser';
import { GameCursor } from '../cursor/GameCursor';

/**
 * The skill target cursor (art-source/ui/cursor/skill_target_cursor.png, as delivered): a 31 x 15 sheet with two
 * frames side by side that are not on an even grid, so each is cut with its own 10 x 10 rectangle centred on the
 * same point - the click point never moves between them.
 *   frame 1: target-select mode, ready (four open corners)
 *   frame 2: left button held (the corners closed into a ring)
 * Native CSS cursors (no input lag), x2 with nearest neighbour like the other cursors; the hotspot is the centre.
 * It takes the cursor over from the game cursor (GameCursor.setOverride) and gives it back with 'none'.
 */
export const SKILL_CURSOR = {
  key: 'ui_cursor_skill_target',
  url: 'assets/ui/cursor/skill_target_cursor.png',
  sheetWidth: 31,
  sheetHeight: 15,
  /** Source rectangles (x, y, w, h): idle, pressed. */
  frames: [
    [2, 2, 10, 10],
    [18, 2, 10, 10],
  ] as ReadonlyArray<readonly [number, number, number, number]>,
  hotspot: { x: 5, y: 5 },
  scale: 2,
} as const;

export type SkillCursorState = 'none' | 'idle' | 'press';

export class SkillTargetCursor {
  private readonly cursors: string[] = [];
  private current: SkillCursorState = 'none';

  constructor(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists(SKILL_CURSOR.key)) return; // art failed to load: the normal cursor stays
    const source = textures.get(SKILL_CURSOR.key).getSourceImage() as CanvasImageSource;
    const { scale: k, hotspot } = SKILL_CURSOR;
    for (const [sx, sy, w, h] of SKILL_CURSOR.frames) {
      const c = document.createElement('canvas');
      c.width = w * k;
      c.height = h * k;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false; // crisp pixels, alpha untouched
      ctx.drawImage(source, sx, sy, w, h, 0, 0, w * k, h * k);
      this.cursors.push(`url(${c.toDataURL('image/png')}) ${hotspot.x * k} ${hotspot.y * k}, auto`);
    }
  }

  get state(): SkillCursorState {
    return this.current;
  }

  set(state: SkillCursorState): void {
    if (state === this.current) return;
    this.current = state;
    if (this.cursors.length < 2) return;
    GameCursor.setOverride(state === 'none' ? null : this.cursors[state === 'idle' ? 0 : 1]);
  }
}
