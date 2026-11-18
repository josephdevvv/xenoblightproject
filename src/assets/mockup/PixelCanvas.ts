/**
 * Tiny offscreen canvas helper used to paint TEMPORARY mockup art at low resolution.
 * Everything in /assets/mockup is throw-away and will be replaced by real sprite sheets.
 */
export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('2D canvas context is not available.');
    }
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  pixel(x: number, y: number, color: string): void {
    this.rect(x, y, 1, 1, color);
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.pixel(x, y, color);
      }
    }
  }

  /** Bresenham line with a square brush. */
  line(x0: number, y0: number, x1: number, y1: number, color: string, thickness = 1): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    const offset = Math.floor(thickness / 2);
    for (;;) {
      this.rect(x - offset, y - offset, thickness, thickness, color);
      if (x === tx && y === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Recolours opaque pixels whose left or top neighbour is empty (cheap top-left rim light). */
  rimLight(color: string): void {
    const data = this.ctx.getImageData(0, 0, this.width, this.height).data;
    const opaque = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.width && y < this.height && data[(y * this.width + x) * 4 + 3] > 0;
    const targets: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (opaque(x, y) && (!opaque(x - 1, y) || !opaque(x, y - 1))) targets.push(x, y);
      }
    }
    for (let i = 0; i < targets.length; i += 2) this.pixel(targets[i], targets[i + 1], color);
  }

  /** Paints a 1px outline around every opaque shape (4-neighbourhood). */
  outline(color: string): void {
    const data = this.ctx.getImageData(0, 0, this.width, this.height).data;
    const opaque = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.width && y < this.height && data[(y * this.width + x) * 4 + 3] > 0;
    const targets: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!opaque(x, y) && (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))) {
          targets.push(x, y);
        }
      }
    }
    for (let i = 0; i < targets.length; i += 2) this.pixel(targets[i], targets[i + 1], color);
  }

  /** Returns a new canvas scaled up with nearest-neighbour sampling. */
  upscale(scale: number): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = this.width * scale;
    out.height = this.height * scale;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available.');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out;
  }
}

/** Deterministic PRNG (mulberry32) so mockup art is identical on every run. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear blend of two '#rrggbb' colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 0xff;
    const cb = (pb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * t);
  };
  const value = (ch(16) << 16) | (ch(8) << 8) | ch(0);
  return `#${value.toString(16).padStart(6, '0')}`;
}

/** 4x4 ordered-dither threshold (0..1) for retro-style soft shapes. */
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayerThreshold(x: number, y: number): number {
  return (BAYER_4X4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}
