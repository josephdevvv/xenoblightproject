import type Phaser from 'phaser';
import { CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH } from './CharacterSheetLayout';

/** Solid-pixel bounds of the figure inside one 64x64 frame (alpha >= 128). */
export interface FrameBounds {
  top: number;
  /** Lowest solid row = ground contact. */
  bottom: number;
  height: number;
  /** Horizontal centre of the feet (solid pixels in the lowest rows), in frame pixels. */
  feetX: number;
}

/** Per-frame bounds of a sheet, in texture frame order (row-major). Null for an empty frame. */
export type SheetMetrics = ReadonlyArray<FrameBounds | null>;

const SOLID_ALPHA = 128;
/** Rows above the lowest solid row that count as "feet" for the horizontal anchor. */
const FEET_ROWS = 4;

const cache = new Map<string, SheetMetrics>();

/**
 * Measures where the figure actually is inside each frame of a character sheet.
 * Art from different sources places and sizes the character differently in its 64x64 cell; these
 * measurements let the animator anchor every sheet on its feet and normalise its height.
 * Computed once per texture (a single getImageData on a small sheet) and cached.
 */
export function getSheetMetrics(textures: Phaser.Textures.TextureManager, key: string): SheetMetrics {
  const cached = cache.get(key);
  if (cached) return cached;

  const source = textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = source.width;
  const height = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is not available.');
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;

  const cols = Math.floor(width / CHARACTER_FRAME_WIDTH);
  const rows = Math.floor(height / CHARACTER_FRAME_HEIGHT);
  const frames: (FrameBounds | null)[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      frames.push(measureFrame(data, width, c * CHARACTER_FRAME_WIDTH, r * CHARACTER_FRAME_HEIGHT));
    }
  }
  cache.set(key, frames);
  return frames;
}

/** Drop cached measurements (called when the texture is evicted). */
export function forgetSheetMetrics(key: string): void {
  cache.delete(key);
}

function measureFrame(data: Uint8ClampedArray, stride: number, ox: number, oy: number): FrameBounds | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < CHARACTER_FRAME_HEIGHT; y++) {
    const row = ((oy + y) * stride + ox) * 4;
    for (let x = 0; x < CHARACTER_FRAME_WIDTH; x++) {
      if (data[row + x * 4 + 3] >= SOLID_ALPHA) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (top < 0) return null;

  let sum = 0;
  let count = 0;
  for (let y = Math.max(top, bottom - FEET_ROWS + 1); y <= bottom; y++) {
    const row = ((oy + y) * stride + ox) * 4;
    for (let x = 0; x < CHARACTER_FRAME_WIDTH; x++) {
      if (data[row + x * 4 + 3] >= SOLID_ALPHA) {
        sum += x + 0.5;
        count++;
      }
    }
  }
  return { top, bottom, height: bottom - top + 1, feetX: count > 0 ? sum / count : CHARACTER_FRAME_WIDTH / 2 };
}
