/**
 * Pixel recipes for the death transition, applied to the character's CURRENT frame at the moment of
 * death (so the ghost always matches the appearance - gender, hairstyle, outfit - with no extra art).
 * Pure functions on RGBA arrays (no Phaser), unit-tested. Output alpha is hard (0 or one level) so the
 * result stays crisp pixel art under nearest-neighbour scaling.
 */

/** 4x4 ordered-dither matrix, values 0..15. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function bayer4(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** First / last opaque row of an RGBA image (alpha >= 128), or null when empty. */
export function opaqueRows(rgba: Uint8ClampedArray, width: number, height: number): { top: number; bottom: number } | null {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] >= 128) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return top < 0 ? null : { top, bottom };
}

export interface GhostOptions {
  /** Body height share (from the head) that stays fully solid - the upper body. */
  solidUntil: number;
  /** Body height share at which nothing is left (feet and below are gone). */
  goneAt: number;
}

export const GHOST_OPTIONS: GhostOptions = { solidUntil: 0.42, goneAt: 0.84 };

/**
 * How much of row `y` survives (1 = all, 0 = none): solid upper body, then a smooth taper so the legs
 * fade more than the torso and the feet disappear completely.
 */
export function ghostRowKeep(y: number, top: number, bottom: number, o: GhostOptions = GHOST_OPTIONS): number {
  const t = (y - top) / Math.max(1, bottom - top);
  if (t <= o.solidUntil) return 1;
  if (t >= o.goneAt) return 0;
  const u = (t - o.solidUntil) / (o.goneAt - o.solidUntil);
  return 1 - u * u * (3 - 2 * u); // smoothstep down
}

/**
 * The spectral version of a frame: desaturated pale grey-white (dark outlines become mid grey so the
 * silhouette stays readable), with the lower body thinned out by ordered dithering - it tapers into mist.
 * Kept pixels are fully opaque; the ghost's translucency is the image alpha.
 */
export function ghostPixels(rgba: Uint8ClampedArray, width: number, height: number, o: GhostOptions = GHOST_OPTIONS): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const rows = opaqueRows(rgba, width, height);
  if (!rows) return out;
  for (let y = 0; y < height; y++) {
    const keep = ghostRowKeep(y, rows.top, rows.bottom, o);
    if (keep <= 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128) continue;
      if (keep < 1 && bayer4(x, y) >= keep) continue;
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const v = Math.min(246, 124 + lum * 0.55);
      out[i] = v - 6;
      out[i + 1] = v - 2;
      out[i + 2] = v + 6;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Fixed per-pixel noise in [0, 1) for the dissolve (deterministic for a given seed). */
export function dissolveNoise(width: number, height: number, seed = 1): Float32Array {
  const noise = new Float32Array(width * height);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < noise.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    noise[i] = (s >>> 0) / 4294967296;
  }
  return noise;
}

/**
 * The body at dissolve progress p (0 = whole, 1 = gone): pixels whose noise is below p are gone, the band
 * just above it glows pale (the body turning to spirit) - no colourful magic, just the ghost's grey-white.
 */
export function dissolvePixels(rgba: Uint8ClampedArray, noise: Float32Array, p: number, band = 0.12): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0, n = 0; i < out.length; i += 4, n++) {
    if (out[i + 3] === 0) continue;
    const v = noise[n];
    if (v < p) {
      out[i + 3] = 0;
    } else if (v < p + band) {
      out[i] = 214;
      out[i + 1] = 218;
      out[i + 2] = 226;
    }
  }
  return out;
}
