import type Phaser from 'phaser';
import { GameCursor } from '../cursor/GameCursor';

/**
 * The NPC talk cursor (art-source/ui/cursor/npc_talk_cursor.png, as delivered): a 32 x 14 sheet of two 16 x 14
 * frames - a pointing hand.
 *   frame 1: hovering an NPC that can be talked to
 *   frame 2: left button pressed on it
 * Built like the monster cursor: each frame becomes a native CSS cursor (no input lag), scaled x2 with nearest
 * neighbour; the hotspot is the fingertip, pixel (5, 3). It takes the cursor over from the game cursor and gives it
 * back when the pointer leaves the NPC.
 */
export const NPC_CURSOR = {
  key: 'ui_cursor_npc_talk',
  url: 'assets/ui/cursor/npc_talk_cursor.png',
  frameWidth: 16,
  frameHeight: 14,
  frames: 2,
  hotspot: { x: 5, y: 3 },
  scale: 2,
} as const;

export type NpcCursorState = 'none' | 'hover' | 'press';

export class NpcCursor {
  private readonly cursors: string[] = [];
  private state: NpcCursorState = 'none';

  constructor(textures: Phaser.Textures.TextureManager) {
    if (!textures.exists(NPC_CURSOR.key)) return; // art failed to load: the normal cursor stays
    const source = textures.get(NPC_CURSOR.key).getSourceImage() as CanvasImageSource;
    const { frameWidth: w, frameHeight: h, scale: k, hotspot } = NPC_CURSOR;
    for (let f = 0; f < NPC_CURSOR.frames; f++) {
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

  getState(): NpcCursorState {
    return this.state;
  }

  /** Every frame: is a talkable NPC under the pointer (and not UI)? Leaving it gives the cursor back. */
  update(overNpc: boolean): void {
    if (!overNpc) this.set('none');
    else if (this.state === 'none') this.set('hover');
  }

  /** Left button went down on the NPC. */
  press(): void {
    this.set('press');
  }

  /** Left button released: back to the hover frame over the NPC, the normal cursor elsewhere. */
  release(overNpc: boolean): void {
    if (this.state === 'press') this.set(overNpc ? 'hover' : 'none');
  }

  reset(): void {
    this.set('none');
  }

  private set(state: NpcCursorState): void {
    if (state === this.state) return;
    this.state = state;
    if (!this.cursors.length) return;
    GameCursor.setOverride(state === 'none' ? null : this.cursors[state === 'hover' ? 0 : 1]);
  }
}
