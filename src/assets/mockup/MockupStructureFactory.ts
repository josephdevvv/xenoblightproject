import Phaser from 'phaser';
import { MOCKUP_PIXEL_SCALE } from '../../config/constants';
import type {
  DecalVariant,
  PostVariant,
  WallOrientation,
  WallVariant,
} from '../../world/structures/StructureBlueprints';
import { createRng, mixHex, PixelCanvas } from './PixelCanvas';

/**
 * TEMPORARY procedural art for walk-in structures (medieval European ruin):
 * stone ground floor, half-timbered upper storey (dark beams + pale plaster), charred tops.
 * Textures are generated lazily and cached per variant.
 */

export interface PieceArt {
  key: string;
  originX: number;
  originY: number;
}

export interface PostArt extends PieceArt {
  /** Pixel offset (negative = up) from the anchor to the top of the post. */
  topOffsetY: number;
}

/** Horizontal extent of one tile edge in logical pixels (32 px / 2). */
const SEG = 16;
const TALL = 34;
const STONE_TOP = 11;
const RAFTER_MARGIN = 10;

const COLORS = {
  stone: ['#55555c', '#4c4c53', '#5c5c63'],
  mortar: '#2b2b30',
  stoneCap: '#6d6d75',
  beam: '#252220',
  charred: '#18161a',
  plaster: '#7a7a81',
  plasterDirty: '#6c6c73',
  lath: '#3a3633',
  void: '#0b0b0d',
  rafter: '#1d1a19',
  rafterLight: '#34302d',
} as const;

interface WallProfile {
  heights: number[];
  window: boolean;
  rafters: boolean;
  /** True when the top edge is an intact wall plate rather than a broken edge. */
  intactTop: boolean;
}

function wallProfile(variant: WallVariant): WallProfile {
  const rng = createRng(hash(variant));
  const jag = (amp: number): number => Math.round((rng() - 0.5) * 2 * amp);
  const heights: number[] = [];
  for (let u = 0; u < SEG; u++) {
    let h: number;
    switch (variant) {
      case 'tall_plain':
        h = TALL;
        break;
      case 'tall_window':
        h = u >= 12 ? TALL - 2 : TALL;
        break;
      case 'tall_gable':
        h = TALL + Math.round(Math.max(0, 12 - Math.abs(u - 7.5) * 1.6)) - (u === 10 || u === 11 ? 3 : 0);
        break;
      case 'tall_broken':
        h = Math.round(TALL - u * 1.1) + jag(1);
        break;
      case 'mid_broken':
        h = Math.max(8, Math.round(19 - u * 0.5) + jag(2));
        break;
      case 'low_broken':
        h = 4 + Math.floor(rng() * 4);
        break;
      case 'low_rubble':
        h = 2 + Math.floor(rng() * 3);
        break;
    }
    heights.push(h);
  }
  return {
    heights,
    window: variant === 'tall_window',
    rafters: variant === 'tall_plain' || variant === 'tall_window',
    intactTop: variant === 'tall_plain' || variant === 'tall_window' || variant === 'tall_gable',
  };
}

export function getWallTexture(textures: Phaser.Textures.TextureManager, variant: WallVariant, orientation: WallOrientation): PieceArt {
  const key = `wall_${variant}_${orientation}`;
  const profile = wallProfile(variant);
  const maxH = Math.max(...profile.heights);
  const baseY = maxH + RAFTER_MARGIN + 1;
  const height = baseY + 9;
  if (!textures.exists(key)) {
    textures.addCanvas(key, drawWall(profile, orientation, baseY, height, hash(key)));
  }
  return { key, originX: orientation === 'x' ? 0 : 1, originY: (baseY + 1) / height };
}

function drawWall(p: WallProfile, orientation: WallOrientation, baseY: number, height: number, seed: number): HTMLCanvasElement {
  const pc = new PixelCanvas(SEG, height);
  const rng = createRng(seed);
  const mx = (u: number): number => (orientation === 'y' ? SEG - 1 - u : u);
  const shade = (c: string): string => (orientation === 'y' ? mixHex(c, '#000000', 0.32) : c);
  const ground = (u: number): number => baseY + Math.floor(u / 2);

  for (let u = 0; u < SEG; u++) {
    const h = p.heights[u];
    const gy = ground(u);
    for (let v = 0; v < h; v++) {
      let color = faceColor(u, v, h, p, rng);
      if (v === 0) color = mixHex(color, '#000000', 0.3);
      pc.pixel(mx(u), gy - v, shade(color));
    }
    // top edge
    const inStone = h <= STONE_TOP + 1;
    const cap = p.intactTop ? COLORS.beam : inStone ? COLORS.stoneCap : COLORS.charred;
    pc.pixel(mx(u), gy - h, shade(cap));
  }

  if (p.rafters) {
    for (const u0 of [3, 11]) {
      const y0 = ground(u0) - p.heights[u0] - 1;
      pc.line(mx(u0), y0, mx(u0 - 4), y0 - 9, COLORS.rafter);
      pc.pixel(mx(u0 - 4), y0 - 9, COLORS.rafterLight);
    }
  }
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function faceColor(u: number, v: number, h: number, p: WallProfile, rng: () => number): string {
  // Stone masonry ground floor
  if (v < STONE_TOP || h <= STONE_TOP + 2) {
    const row = Math.floor(v / 3);
    const off = (row % 2) * 2;
    if (v % 3 === 2 || (u + off) % 5 === 0) return COLORS.mortar;
    const block = Math.floor((u + off) / 5);
    const tone = COLORS.stone[(row * 7 + block * 3) % COLORS.stone.length];
    return rng() < 0.08 ? mixHex(tone, '#000000', 0.2) : tone;
  }

  // Half-timbered upper storey
  const tv = v - STONE_TOP;
  if (p.window && u >= 9 && u <= 13 && tv >= 14 && tv <= 21) {
    if (u === 9 || u === 13 || tv === 14 || tv === 21 || u === 11 || tv === 18) return COLORS.beam;
    return COLORS.void;
  }
  if (tv <= 1) return COLORS.beam; // sill beam
  if (u === 0 || u === 7 || u === SEG - 1) return COLORS.beam; // posts
  if (tv === 12) return COLORS.beam; // middle rail
  if (p.intactTop && v >= TALL - 2 && v < TALL) return COLORS.beam; // top plate
  if (tv >= 2 && tv <= 11) {
    // diagonal braces in the lower panels
    if (u >= 1 && u <= 6 && Math.abs(u - 1 - (tv - 2) * 0.55) < 0.6) return COLORS.beam;
    if (u >= 8 && u <= 14 && Math.abs(14 - u - (tv - 2) * 0.6) < 0.6) return COLORS.beam;
  }
  const r = rng();
  if (r < 0.06) return COLORS.lath; // exposed lath where plaster fell off
  if (r < 0.2) return COLORS.plasterDirty;
  // soot staining towards the burnt top
  return v > h - 4 ? mixHex(COLORS.plaster, COLORS.charred, 0.45) : COLORS.plaster;
}

// ---------------------------------------------------------------------------------------------
// Corner posts / chimney
// ---------------------------------------------------------------------------------------------

const POST_HEIGHTS: Record<PostVariant, number> = {
  chimney: 48,
  post_tall: 36,
  post_mid: 20,
  post_low: 8,
};

export function getPostTexture(textures: Phaser.Textures.TextureManager, variant: PostVariant): PostArt {
  const key = `post_${variant}`;
  const h = POST_HEIGHTS[variant];
  const width = 8;
  const base = h + 3;
  const height = base + 4;
  if (!textures.exists(key)) {
    const pc = new PixelCanvas(width, height);
    const rng = createRng(hash(key));
    const chimney = variant === 'chimney';
    for (let u = 0; u < width; u++) {
      const left = u < width / 2;
      const gy = left ? base + Math.floor(u / 2) : base + Math.floor((width - 1 - u) / 2);
      for (let v = 0; v < h; v++) {
        // big alternating quoin blocks
        const block = Math.floor(v / 4);
        let c = (v % 4 === 3) ? COLORS.mortar : block % 2 === (left ? 0 : 1) ? '#5e5e66' : '#4f4f57';
        if (chimney) c = mixHex(c, '#000000', 0.18);
        if (v > h - 6 && chimney) c = mixHex(c, COLORS.charred, 0.5); // soot
        if (rng() < 0.06) c = mixHex(c, '#000000', 0.25);
        if (!left) c = mixHex(c, '#000000', 0.32);
        pc.pixel(u, gy - v, c);
      }
      pc.pixel(u, gy - h, chimney && u > 1 && u < width - 2 ? COLORS.void : COLORS.stoneCap);
    }
    if (chimney) {
      // dark flue opening on top
      pc.rect(2, base - h - 1, 4, 1, COLORS.void);
      pc.pixel(1, base - h - 1, COLORS.stoneCap);
      pc.pixel(6, base - h - 1, COLORS.stoneCap);
    }
    textures.addCanvas(key, pc.upscale(MOCKUP_PIXEL_SCALE));
  }
  return {
    key,
    originX: 0.5,
    originY: (base + 2) / height,
    topOffsetY: -(h + 2) * MOCKUP_PIXEL_SCALE,
  };
}

// ---------------------------------------------------------------------------------------------
// Floor decals (walkable clutter)
// ---------------------------------------------------------------------------------------------

export function getDecalTexture(textures: Phaser.Textures.TextureManager, variant: DecalVariant): PieceArt {
  const key = `decal_${variant}`;
  if (!textures.exists(key)) {
    let pc: PixelCanvas;
    if (variant === 'fallen_beam') {
      pc = new PixelCanvas(18, 11);
      pc.line(1, 2, 16, 9, COLORS.rafter, 2);
      pc.line(1, 1, 16, 8, COLORS.rafterLight);
      pc.pixel(9, 4, COLORS.charred);
    } else {
      const big = variant === 'rubble';
      pc = new PixelCanvas(big ? 16 : 10, big ? 9 : 6);
      const rng = createRng(hash(key));
      const n = big ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const x = 2 + Math.floor(rng() * (pc.width - 5));
        const y = 2 + Math.floor(rng() * (pc.height - 4));
        const w = 2 + Math.floor(rng() * 2);
        pc.rect(x, y, w, 2, COLORS.stone[i % COLORS.stone.length]);
        pc.rect(x, y + 1, w, 1, '#3c3c42');
      }
      if (big) {
        pc.rect(5, 3, 3, 1, COLORS.plasterDirty);
        pc.pixel(10, 5, COLORS.beam);
      }
    }
    pc.ctx.save();
    pc.ctx.globalCompositeOperation = 'destination-over';
    pc.fillEllipse(pc.width / 2, pc.height / 2 + 1, pc.width / 2, pc.height / 2.5, 'rgba(0,0,0,0.35)');
    pc.ctx.restore();
    textures.addCanvas(key, pc.upscale(MOCKUP_PIXEL_SCALE));
  }
  return { key, originX: 0.5, originY: 0.5 };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
