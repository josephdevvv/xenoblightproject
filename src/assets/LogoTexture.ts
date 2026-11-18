import Phaser from 'phaser';
import { TextureKeys } from './TextureKeys';

export const LOGO_URL = 'assets/ui/xenoblight_logo.jpg';

/**
 * Region of the source image that contains the emblem + title, as fractions of the image size
 * (fractions keep working if the file is replaced by a higher-resolution version).
 */
const LOGO_CROP = { x: 60 / 1408, y: 20 / 768, w: 1290 / 1408, h: 660 / 768 };

/** Where the edge fade starts (0..1 from centre to edge). Hides the rectangular, non-transparent background. */
const FADE_START = { x: 0.9, y: 0.86 };

/**
 * The logo is high-resolution painted art, but the game renders with nearest-neighbour filtering.
 * Showing it scaled down directly would alias badly, so this bakes a smoothly downscaled copy at the
 * exact on-screen size (displayed 1:1) and fades its edges into the background.
 *
 * Returns the texture key, or null if the logo file failed to load.
 */
export function getLogoTexture(scene: Phaser.Scene, displayHeight: number): string | null {
  const key = `ui_logo_${displayHeight}`;
  if (scene.textures.exists(key)) return key;
  if (!scene.textures.exists(TextureKeys.ui.logoSource)) return null;

  const source = scene.textures.get(TextureKeys.ui.logoSource).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const sx = Math.round(source.width * LOGO_CROP.x);
  const sy = Math.round(source.height * LOGO_CROP.y);
  const sw = Math.round(source.width * LOGO_CROP.w);
  const sh = Math.round(source.height * LOGO_CROP.h);
  const targetH = displayHeight;
  const targetW = Math.round((displayHeight * sw) / sh);

  // Progressive halving gives a much cleaner result than one large downscale step.
  let current = makeCanvas(sw, sh);
  context(current).drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  while (current.width / 2 > targetW) {
    const next = makeCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    context(next).drawImage(current, 0, 0, next.width, next.height);
    current = next;
  }
  const out = makeCanvas(targetW, targetH);
  const ctx = context(out);
  ctx.drawImage(current, 0, 0, targetW, targetH);

  // Feather the edges.
  const image = ctx.getImageData(0, 0, targetW, targetH);
  const data = image.data;
  const fade = (t: number, start: number): number => {
    const a = Math.abs(t);
    if (a <= start) return 1;
    const k = Math.min(1, (a - start) / (1 - start));
    return 1 - k * k * (3 - 2 * k); // smoothstep falloff
  };
  for (let y = 0; y < targetH; y++) {
    const fy = fade(((y + 0.5) / targetH) * 2 - 1, FADE_START.y);
    for (let x = 0; x < targetW; x++) {
      const fx = fade(((x + 0.5) / targetW) * 2 - 1, FADE_START.x);
      const i = (y * targetW + x) * 4 + 3;
      data[i] = Math.round(data[i] * fx * fy);
    }
  }
  ctx.putImageData(image, 0, 0);

  scene.textures.addCanvas(key, out);
  return key;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context is not available.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}
