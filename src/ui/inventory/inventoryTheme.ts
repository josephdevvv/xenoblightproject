import type Phaser from 'phaser';
import type { EquipmentSlotId } from '../../inventory/InventorySlots';
import type { Rect } from '../passiveTree/PassiveTreeLayout';

/** Same flat palette as the Passive Tree window (minimal layer pack), plus the slot tones. */
export const INV_COLORS = {
  line: 0xe7e7ee,
  dim: 0x3a3a45,
  fill: 0x0e0e12,
  red: 0xd3424b,
  redText: '#d3424b',
  lineText: '#e7e7ee',
  slotFill: 0x14141a,
  slotCorner: 0x7a7a86,
  body: 0x212129,
  glyph: 0x4a4a57,
} as const;

/** 1-px rectangle outline, `grow` px outside `rect`. */
export function drawOutline(g: Phaser.GameObjects.Graphics, [x, y, w, h]: Rect, grow: number, color: number): void {
  const l = x - grow, t = y - grow, ow = w + grow * 2, oh = h + grow * 2;
  g.fillStyle(color, 1).fillRect(l, t, ow, 1).fillRect(l, t + oh - 1, ow, 1).fillRect(l, t, 1, oh).fillRect(l + ow - 1, t, 1, oh);
}

/** Dark panel with a 1-px light border. */
export function drawPanelFrame(g: Phaser.GameObjects.Graphics, rect: Rect): void {
  const [x, y, w, h] = rect;
  g.fillStyle(INV_COLORS.fill, 1).fillRect(x, y, w, h);
  drawOutline(g, rect, 0, INV_COLORS.line);
}

/** Dark well with a dim 1-px border and lighter corner brackets (slots, the item icon's box). */
export function drawSlotFrame(g: Phaser.GameObjects.Graphics, rect: Rect): void {
  const [x, y, w, h] = rect;
  g.fillStyle(INV_COLORS.slotFill, 1).fillRect(x, y, w, h);
  drawOutline(g, rect, 0, INV_COLORS.dim);
  const len = Math.max(3, Math.floor(w / 6));
  g.fillStyle(INV_COLORS.slotCorner, 1);
  for (const cx of [x, x + w - len]) g.fillRect(cx, y, len, 1).fillRect(cx, y + h - 1, len, 1);
  for (const cy of [y, y + h - len]) g.fillRect(x, cy, 1, len).fillRect(x + w - 1, cy, 1, len);
}

/** 12x12 marks of the empty equipment slots (what belongs there - not items). */
export const SLOT_GLYPHS: Readonly<Record<EquipmentSlotId, readonly string[]>> = {
  weapon: [
    '.........###',
    '........####',
    '.......####.',
    '......####..',
    '.....####...',
    '....####....',
    '#..####.....',
    '##.###......',
    '.####.......',
    '..###.......',
    '.##.##......',
    '##..........',
  ],
  hat: [
    '............',
    '....####....',
    '...######...',
    '...######...',
    '..########..',
    '..########..',
    '............',
    '..########..',
    '############',
    '.##########.',
    '............',
    '............',
  ],
  armor: [
    '.###....###.',
    '#####..#####',
    '############',
    '############',
    '##.######.##',
    '...######...',
    '...######...',
    '............',
    '...######...',
    '..########..',
    '..########..',
    '............',
  ],
  shoes: [
    '............',
    '...#####....',
    '...#####....',
    '............',
    '...#####....',
    '...#####....',
    '...######...',
    '...########.',
    '...#########',
    '............',
    '...#########',
    '...###..####',
  ],
  charm: [
    '.#........#.',
    '.##......##.',
    '..##....##..',
    '...##..##...',
    '....####....',
    '.....##.....',
    '....####....',
    '...##..##...',
    '..##.##.##..',
    '...##..##...',
    '....####....',
    '.....##.....',
  ],
};

export const GLYPH_SIZE = 12;

/** Draws a glyph centred in a slot, in whole pixels. */
export function drawGlyph(g: Phaser.GameObjects.Graphics, glyph: readonly string[], [x, y, w, h]: Rect, color: number): void {
  const px = Math.max(1, Math.floor((w * 0.62) / GLYPH_SIZE));
  const left = x + Math.floor((w - GLYPH_SIZE * px) / 2);
  const top = y + Math.floor((h - GLYPH_SIZE * px) / 2);
  g.fillStyle(color, 1);
  glyph.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(left + i * px, top + j * px, px, px);
  });
}
