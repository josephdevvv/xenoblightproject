import type Phaser from 'phaser';
import type { Point } from '../../core/types';

/** Opaque bounds of one frame (alpha >= 128), inclusive pixel rows / columns inside the frame. */
export interface OpaqueBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * World position of the centre of the visible body in a frame - where on-hit VFX go (the body, not the
 * feet). Works for any sprite size, origin, scale and horizontal flip. Pure, unit-tested.
 */
export function bodyCenterWorld(
  bounds: OpaqueBounds,
  frame: { width: number; height: number },
  sprite: { x: number; y: number; originX: number; originY: number; scaleX: number; scaleY: number; flipX: boolean },
): Point {
  const cx = (bounds.left + bounds.right + 1) / 2;
  const cy = (bounds.top + bounds.bottom + 1) / 2;
  const dx = (cx - sprite.originX * frame.width) * sprite.scaleX;
  const dy = (cy - sprite.originY * frame.height) * sprite.scaleY;
  return { x: sprite.x + (sprite.flipX ? -dx : dx), y: sprite.y + dy };
}

const boundsCache = new Map<string, OpaqueBounds | null>();

/** Opaque bounds of the sprite's CURRENT frame (measured once per texture frame, then cached). */
export function frameOpaqueBounds(sprite: Phaser.GameObjects.Sprite): OpaqueBounds | null {
  const frame = sprite.frame;
  const key = `${frame.texture.key}#${frame.name}`;
  if (boundsCache.has(key)) return boundsCache.get(key)!;
  const w = frame.cutWidth;
  const h = frame.cutHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let result: OpaqueBounds | null = null;
  if (ctx) {
    ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let left = w, top = h, right = -1, bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] < 128) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right >= 0) result = { left, top, right, bottom };
  }
  boundsCache.set(key, result);
  return result;
}

/**
 * Hit anchor of a sprite as it is drawn right now (current animation frame, origin, scale, flip): the
 * centre of its visible body. Falls back to the middle of the frame when the frame is empty.
 */
export function spriteHitAnchor(sprite: Phaser.GameObjects.Sprite): Point {
  const frame = { width: sprite.frame.cutWidth, height: sprite.frame.cutHeight };
  const bounds = frameOpaqueBounds(sprite) ?? { left: 0, top: 0, right: frame.width - 1, bottom: frame.height - 1 };
  return bodyCenterWorld(bounds, frame, sprite);
}
