import type Phaser from 'phaser';

/** The painted pixels of a text (columns / rows, inclusive), or null when nothing is painted. */
export interface InkBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Ink bounds of RGBA pixels (alpha above `minAlpha`). Pure. */
export function inkBounds(rgba: ArrayLike<number>, width: number, height: number, minAlpha = 100): InkBounds | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] <= minAlpha) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, right, top, bottom };
}

/**
 * Top-left position (whole pixels) that puts the ink of a text box in the middle of `box`. Text boxes carry room
 * for Thai marks above and below, so centring the box itself would leave the letters off-centre. Pure.
 */
export function centerInkIn(box: { x: number; y: number; width: number; height: number }, ink: InkBounds): { x: number; y: number } {
  return {
    x: Math.round(box.x + box.width / 2 - (ink.left + ink.right + 1) / 2),
    y: Math.round(box.y + box.height / 2 - (ink.top + ink.bottom + 1) / 2),
  };
}

/** The ink of a Phaser text as rendered now (its own canvas); null when it cannot be read. */
export function textInk(text: Phaser.GameObjects.Text): InkBounds | null {
  const canvas = text.canvas;
  const ctx = canvas?.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const scale = text.style.resolution || 1;
  const ink = inkBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  if (!ink || scale === 1) return ink;
  return { left: Math.floor(ink.left / scale), right: Math.floor(ink.right / scale), top: Math.floor(ink.top / scale), bottom: Math.floor(ink.bottom / scale) };
}
