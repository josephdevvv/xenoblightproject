import Phaser from 'phaser';

/**
 * UI font: ZF #2ndPixelus (Chayanon Ruamcharoen, f0nt.com) - a pixel font with full Thai
 * (U+0E01-0E5B incl. tone marks and Thai digits) and Basic Latin. Latin letters are capitals only:
 * lowercase input renders with the capital glyphs (by the font's design).
 *
 * Why the odd size: the outlines sit on a ~143-unit grid (2048 units/em) with a 895-unit advance.
 * At 13.7296 px (= 2048 * 6 / 895) every advance is exactly 6 px and every outline edge lands within
 * ~0.2 px of a pixel boundary. Canvas text is always anti-aliased, so text is drawn at 4x
 * (`resolution: 4`) and each 4x4 block is then snapped to one solid pixel or transparency
 * (majority vote). The browser still does the text shaping, so Thai vowels and tone marks are
 * positioned correctly; only the final pixels are made crisp.
 *
 * If the font file cannot be loaded, text falls back to a Thai-capable system font and is drawn
 * normally (no snapping).
 */
export const PIXEL_FONT_FAMILY = 'ZF2ndPixelus';
export const PIXEL_FONT_URL = 'assets/fonts/zf2ndpixelus/ZF2ndPixelus.ttf';
/** Thai-capable fallbacks (Windows, macOS, Linux) used only if the pixel font is unavailable. */
export const FALLBACK_FONTS = '"Leelawadee UI", Tahoma, "Noto Sans Thai", "Thonburi", sans-serif';
export const UI_FONT_STACK = `"${PIXEL_FONT_FAMILY}", ${FALLBACK_FONTS}`;

/** 1x size: one font pixel = one game pixel. */
export const PIXEL_FONT_SIZE = (2048 * 6) / 895;
/** Supersampling factor for the snap filter. */
export const PIXEL_TEXT_RESOLUTION = 4;
/**
 * Fixed line metrics at 1x (game pixels). Ascent covers the highest Thai tone mark stacked on an
 * upper vowel (~10.1 px), descent the lowest below-vowel (~3.5 px); integer values keep the
 * baseline on a pixel boundary.
 */
export const PIXEL_FONT_METRICS = { ascent: 11, descent: 4, fontSize: 15 } as const;

let pixelFontReady = false;

/** True once the pixel font has loaded (snapping is only applied to it). */
export function isPixelFontReady(): boolean {
  return pixelFontReady;
}

/** Loads the pixel font before the game starts. Never rejects; gives up after `timeoutMs`. */
export async function loadPixelFont(timeoutMs = 5000): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  try {
    const face = new FontFace(PIXEL_FONT_FAMILY, `url(${PIXEL_FONT_URL})`);
    const loaded = await Promise.race([
      face.load(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!loaded) {
      console.warn('[font] pixel font load timed out; using fallback fonts');
      return false;
    }
    document.fonts.add(loaded);
    pixelFontReady = true;
    return true;
  } catch (e) {
    console.warn('[font] pixel font failed to load; using fallback fonts', e);
    return false;
  }
}

let installed = false;

/**
 * Wraps Phaser's Text.updateText once: after Phaser draws a pixel-font text into its (4x) canvas,
 * every 4x4 block becomes a single solid pixel (its centre colour) or transparent, then the canvas
 * is re-uploaded. With pixelArt (nearest) sampling the 4x canvas then displays as crisp 1x pixels.
 */
export function installPixelTextSnap(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.GameObjects.Text.prototype as unknown as { updateText: () => Phaser.GameObjects.Text };
  const original = proto.updateText;
  proto.updateText = function (this: Phaser.GameObjects.Text) {
    const result = original.call(this);
    if (pixelFontReady && this.style.resolution === PIXEL_TEXT_RESOLUTION && this.style.fontFamily.includes(PIXEL_FONT_FAMILY)) {
      snapCanvas(this.canvas, PIXEL_TEXT_RESOLUTION);
      const renderer = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer | null;
      if (renderer && 'gl' in renderer && renderer.gl) {
        this.frame.source.glTexture = renderer.canvasToTexture(this.canvas, this.frame.source.glTexture ?? undefined, true);
      }
    }
    return result;
  };
}

/** Majority vote per block: >= 50 % coverage -> solid (centre texel colour), else transparent. */
export function snapCanvas(canvas: HTMLCanvasElement, block: number): void {
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const area = block * block;
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      let alphaSum = 0;
      let best = -1;
      let bestAlpha = -1;
      const cx = Math.min(bx + (block >> 1), w - 1);
      const cy = Math.min(by + (block >> 1), h - 1);
      for (let y = by; y < by + block && y < h; y++) {
        for (let x = bx; x < bx + block && x < w; x++) {
          const i = (y * w + x) * 4;
          const a = d[i + 3];
          alphaSum += a;
          if (a > bestAlpha) {
            bestAlpha = a;
            best = i;
          }
        }
      }
      const solid = alphaSum / area >= 128;
      // Colour: the centre texel if it is opaque enough, otherwise the most opaque texel.
      const centre = (cy * w + cx) * 4;
      const src = d[centre + 3] >= 128 ? centre : best;
      const r = d[src];
      const g = d[src + 1];
      const b = d[src + 2];
      for (let y = by; y < by + block && y < h; y++) {
        for (let x = bx; x < bx + block && x < w; x++) {
          const i = (y * w + x) * 4;
          if (solid) {
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = 255;
          } else {
            d[i + 3] = 0;
          }
        }
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
