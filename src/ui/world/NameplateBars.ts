import type Phaser from 'phaser';
import { DEPTH } from '../../config/constants';

/**
 * Thin HP / SP bars with the world name label (player: HP, SP, then the name; monsters: HP, then the name) - one look
 * for everything. Each bar is a 1-px dark frame around a 2-px fill; HP is green, SP the HUD's blue. The bars start
 * 1 px under the ground root and the name follows right below them, so all of it follows
 * the entity's world position (not its animated frame) and never covers a flying monster's body, which is drawn
 * above that root. Whole pixels only; redrawn only when a fill changes.
 */
export type NameplateBarKind = 'hp' | 'sp';

export const NAMEPLATE_BAR = {
  /** Inner (fill) width in px. */
  width: 26,
  /** Fill height in px; the frame adds 1 px around it. */
  fill: 2,
  /** Space between two bars and between the label and the first bar. */
  gap: 1,
} as const;

export const NAMEPLATE_BAR_COLORS: Readonly<Record<NameplateBarKind, number>> = {
  hp: 0x4fbf4f,
  sp: 0x5699e2,
};
const FRAME_COLOR = 0x0b0b0d;
const EMPTY_COLOR = 0x26262c;

/** Height of one bar with its frame. */
export const NAMEPLATE_BAR_HEIGHT = NAMEPLATE_BAR.fill + 2;

/** Filled width for a value: 0 when empty, at least 1 px while above 0, the full width when full. */
export function barFill(value: number, max: number, width: number = NAMEPLATE_BAR.width): number {
  if (!(max > 0) || !(value > 0)) return 0;
  if (value >= max) return width;
  return Math.min(width - 1, Math.max(1, Math.round((width * value) / max)));
}

/**
 * Every nameplate has two bar rows: row 0 (the player's HP) and row 1 (the player's SP, or a monster's HP - a
 * one-bar plate fills the LOWER row, right above its name). So the name sits at the same height for everyone.
 */
export const NAMEPLATE_ROWS = 2;
/** Space between the ground root (feet) and the first bar row. */
export const STACK_TOP_GAP = 1;
/**
 * Empty rows at the top of a name label's text box before the first visible pixel (measured on the 10-px 'small'
 * role with its 3-px stroke: 3 for Thai tone marks, 4-5 for Latin). The name is pulled up by this much, so its
 * letters - not its box - sit one gap under the bars.
 */
export const NAME_INK_TOP = 3;

/** Top of bar row `row` (0 = upper) for a ground root at `rootY`. Whole pixels. */
export function barTop(rootY: number, row: number): number {
  return Math.round(rootY) + STACK_TOP_GAP + row * (NAMEPLATE_BAR_HEIGHT + NAMEPLATE_BAR.gap);
}

/**
 * Height of a bar block: the fills stacked with NO space between them (green HP right on top of blue SP), one 1-px
 * frame around all of them.
 */
export function stackHeight(count: number): number {
  return count * NAMEPLATE_BAR.fill + 2;
}

/**
 * Top of a block of `count` bars: bottom-aligned with the lower row, so a single bar (monsters) stays on that row and
 * the player's HP + SP block ends where the SP bar always ended - the name never moves.
 */
export function stackTop(rootY: number, count: number): number {
  return barTop(rootY, NAMEPLATE_ROWS - 1) + NAMEPLATE_BAR_HEIGHT - stackHeight(count);
}

/** Top of the name label's box: its first visible pixel one gap below the lower bar row. */
export function labelTopUnderBars(rootY: number): number {
  return barTop(rootY, NAMEPLATE_ROWS) - NAME_INK_TOP;
}

export class NameplateBars {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly fills: number[];
  private drawn = '';

  constructor(
    scene: Phaser.Scene,
    private readonly kinds: readonly NameplateBarKind[],
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.NamePlate);
    this.fills = kinds.map(() => NAMEPLATE_BAR.width);
    this.redraw();
  }

  /** Values of one bar (by its kind). */
  set(kind: NameplateBarKind, value: number, max: number): void {
    const i = this.kinds.indexOf(kind);
    if (i >= 0) this.fills[i] = barFill(value, max);
    this.redraw();
  }

  /** Centred under the ground root (x, y); returns where the name label goes (its top, below the bars). */
  place(x: number, rootY: number): number {
    // bottom-aligned on the lower row: a single bar (monsters) takes it, next to its name; two bars touch
    this.g.setPosition(Math.round(x), stackTop(rootY, this.kinds.length));
    return labelTopUnderBars(rootY);
  }

  setVisible(on: boolean): void {
    this.g.setVisible(on);
  }

  setAlpha(alpha: number): void {
    this.g.setAlpha(alpha);
  }

  destroy(): void {
    this.g.destroy();
  }

  private redraw(): void {
    const key = this.fills.join(',');
    if (key === this.drawn) return;
    this.drawn = key;
    const { width, fill } = NAMEPLATE_BAR;
    const left = -Math.floor(width / 2);
    const g = this.g.clear();
    // one frame around the block; the fills touch (no gap, no line between HP and SP)
    g.fillStyle(FRAME_COLOR, 0.9).fillRect(left - 1, 0, width + 2, stackHeight(this.kinds.length));
    this.kinds.forEach((kind, i) => {
      const y = 1 + i * fill;
      g.fillStyle(EMPTY_COLOR, 1).fillRect(left, y, width, fill);
      if (this.fills[i] > 0) g.fillStyle(NAMEPLATE_BAR_COLORS[kind], 1).fillRect(left, y, this.fills[i], fill);
    });
  }
}
