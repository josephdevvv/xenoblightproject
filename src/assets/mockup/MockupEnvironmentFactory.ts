import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, MOCKUP_PIXEL_SCALE, TILE_HEIGHT, TILE_SIDE_HEIGHT, TILE_WIDTH } from '../../config/constants';
import { PALETTE } from '../../config/palette';
import { TextureKeys, type ObjectTextureId } from '../TextureKeys';
import { bayerThreshold, createRng, mixHex, PixelCanvas } from './PixelCanvas';
import { createRuinTextures, RUIN_OBJECT_ART } from './MockupRuinFactory';

/**
 * TEMPORARY procedural tiles, props and FX textures for Milestone 01.
 * Every texture is registered under a key from TextureKeys so real art can replace it 1:1.
 */

// Logical (pre-upscale) tile size: 32 x 16 diamond + 4px earth side.
const TW = TILE_WIDTH / MOCKUP_PIXEL_SCALE;
const TH = TILE_HEIGHT / MOCKUP_PIXEL_SCALE;
const SIDE = TILE_SIDE_HEIGHT / MOCKUP_PIXEL_SCALE;

/** Logical size and ground-contact anchor of each prop (used to derive sprite origins). */
export interface ObjectArtSpec {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export const OBJECT_ART: Readonly<Record<ObjectTextureId, ObjectArtSpec>> = {
  rock: { width: 24, height: 18, anchorX: 12, anchorY: 14 },
  rock_small: { width: 16, height: 12, anchorX: 8, anchorY: 9 },
  dead_tree: { width: 32, height: 48, anchorX: 16, anchorY: 44 },
  pillar: { width: 20, height: 40, anchorX: 10, anchorY: 36 },
  pillar_broken: { width: 22, height: 28, anchorX: 11, anchorY: 24 },
  brazier: { width: 16, height: 20, anchorX: 8, anchorY: 17 },
  shrine: { width: 16, height: 40, anchorX: 8, anchorY: 36 },
  ...RUIN_OBJECT_ART,
};

export function createEnvironmentTextures(textures: Phaser.Textures.TextureManager): void {
  TextureKeys.groundTiles.forEach((key, i) => register(textures, key, () => drawGroundTile(i)));
  TextureKeys.pathTiles.forEach((key, i) => register(textures, key, () => drawPathTile(100 + i)));
  register(textures, TextureKeys.ventTile, drawVentTile);
  TextureKeys.floorTiles.forEach((key, i) => register(textures, key, () => drawFloorTile(i)));
  TextureKeys.brokenCobbleTiles.forEach((key, i) => register(textures, key, () => drawBrokenCobbleTile(i)));
  TextureKeys.plazaTiles.forEach((key, i) => register(textures, key, () => drawFlagstoneTile(i, PLAZA_TONES)));
  TextureKeys.stoneFloorTiles.forEach((key, i) => register(textures, key, () => drawFlagstoneTile(i, STONE_FLOOR_TONES)));
  TextureKeys.rubbleFloorTiles.forEach((key, i) => register(textures, key, () => drawRubbleFloorTile(i)));
  createRuinTextures(textures);

  const o = TextureKeys.objects;
  register(textures, o.rock, () => drawRock(OBJECT_ART.rock, 7));
  register(textures, o.rock_small, () => drawRock(OBJECT_ART.rock_small, 13));
  register(textures, o.dead_tree, drawDeadTree);
  register(textures, o.pillar, drawPillar);
  register(textures, o.pillar_broken, drawBrokenPillar);
  register(textures, o.brazier, drawBrazier);
  register(textures, o.shrine, drawShrine);

  const fx = TextureKeys.fx;
  register(textures, fx.fog, () => drawDitherBlob(64, 32, '#d4d4da', 3, 21, 1.5));
  register(textures, fx.cloud, () => drawDitherBlob(64, 40, '#000000', 4, 57, 1.8));
  register(textures, fx.smoke, () => drawDitherBlob(8, 8, '#b4b4ba', 1, 5, 1.6));
  register(textures, fx.glow, drawGlow);
  register(textures, fx.vignette, drawVignette);
}

function register(textures: Phaser.Textures.TextureManager, key: string, draw: () => HTMLCanvasElement): void {
  if (textures.exists(key)) return; // real art (or an earlier run) already provides it
  textures.addCanvas(key, draw());
}

// ---------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------

/** Half-width of the 2:1 diamond on a given row (stair steps of 2px per row). */
function diamondHalfWidth(y: number): number {
  return y < TH / 2 ? 2 * (y + 1) : 2 * (TH - y);
}

function inDiamond(x: number, y: number): boolean {
  if (y < 0 || y >= TH) return false;
  const hw = diamondHalfWidth(y);
  return x >= TW / 2 - hw && x < TW / 2 + hw;
}

function paintDiamond(pc: PixelCanvas, colorAt: (x: number, y: number) => string): void {
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      if (!inDiamond(x, y)) continue;
      let color = colorAt(x, y);
      // Very subtle bevel so the grid is readable without looking like graph paper.
      if (!inDiamond(x, y + 1)) color = mixHex(color, '#000000', 0.14);
      else if (!inDiamond(x, y - 1)) color = mixHex(color, '#ffffff', 0.03);
      pc.pixel(x, y, color);
    }
  }
}

function paintSides(pc: PixelCanvas, rng: () => number): void {
  for (let x = 0; x < TW; x++) {
    let bottom = -1;
    for (let y = TH - 1; y >= 0; y--) {
      if (inDiamond(x, y)) {
        bottom = y;
        break;
      }
    }
    if (bottom < 0) continue;
    for (let k = 1; k <= SIDE; k++) {
      let color = x < TW / 2 ? '#19191c' : '#111113';
      if (k === SIDE) color = '#0c0c0e';
      else if (rng() < 0.15) color = mixHex(color, '#2a2a2f', 0.5);
      pc.pixel(x, bottom + k, color);
    }
  }
}

function newTileCanvas(): PixelCanvas {
  return new PixelCanvas(TW, TH + SIDE);
}

const GROUND_TONES = ['#25252a', '#232328', '#27272c', '#242429'];

function drawGroundTile(variant: number): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(17 + variant * 31);
  const base = GROUND_TONES[variant % GROUND_TONES.length];
  paintDiamond(pc, () => {
    const r = rng();
    if (r < 0.07) return '#1b1b1f';
    if (r < 0.12) return '#2e2e34';
    return base;
  });

  if (variant === 1) {
    // pebbles
    for (let i = 0; i < 5; i++) {
      const x = 8 + Math.floor(rng() * 16);
      const y = 4 + Math.floor(rng() * 8);
      if (inDiamond(x, y) && inDiamond(x + 1, y)) {
        pc.rect(x, y, 2, 1, '#38383e');
        pc.pixel(x, y + 1, '#1a1a1d');
      }
    }
  } else if (variant === 2) {
    // crack
    let x = 9;
    let y = 6;
    for (let i = 0; i < 14; i++) {
      if (inDiamond(x, y)) pc.pixel(x, y, '#151518');
      x += 1;
      y += rng() < 0.5 ? 0 : rng() < 0.5 ? 1 : -1;
    }
  } else if (variant === 3) {
    // ash patch
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const d = Math.hypot((x - 18) / 7, (y - 8) / 3.5);
        if (inDiamond(x, y) && d < 1 && rng() > d * 0.8) pc.pixel(x, y, '#303036');
      }
    }
  }
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawPathTile(seed: number): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(seed);
  const seeds: { x: number; y: number; tone: string }[] = [];
  const tones = ['#3b3b41', '#37373d', '#404047'];
  while (seeds.length < 7) {
    const x = rng() * TW;
    const y = rng() * TH;
    if (inDiamond(Math.floor(x), Math.floor(y))) {
      seeds.push({ x, y, tone: tones[Math.floor(rng() * tones.length)] });
    }
  }
  const cellAt = (x: number, y: number): number => {
    let best = 0;
    let bestDist = Infinity;
    seeds.forEach((s, i) => {
      // squash distance vertically so stones read as lying flat on the ground
      const d = (x - s.x) ** 2 + ((y - s.y) * 2) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };
  paintDiamond(pc, (x, y) => {
    const cell = cellAt(x, y);
    if (cellAt(x + 1, y) !== cell || cellAt(x, y + 1) !== cell) return '#232327';
    if (cellAt(x, y - 1) !== cell) return '#4a4a51';
    return rng() < 0.08 ? '#303035' : seeds[cell].tone;
  });
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawVentTile(): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(909);
  paintDiamond(pc, () => (rng() < 0.1 ? '#1b1b1f' : '#222226'));
  for (let y = 4; y < 12; y++) {
    for (let x = 8; x < 24; x++) {
      const d = Math.hypot((x + 0.5 - 16) / 6, (y + 0.5 - 8) / 2.6);
      if (d < 0.6) pc.pixel(x, y, '#0b0b0d');
      else if (d < 0.85) pc.pixel(x, y, y < 8 ? '#3a3a40' : '#151518');
      else if (d < 1.1 && rng() < 0.5) pc.pixel(x, y, '#2e2e33');
    }
  }
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

/** Burnt wooden plank floor; planks run along the tile's x axis (slope 1:2 on screen). */
function drawFloorTile(variant: number): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(500 + variant * 13);
  const tones = ['#36322f', '#312d2a', '#3a3532'];
  const plankWidth = 3;
  const offsets = Array.from({ length: 12 }, () => Math.floor(rng() * 9));
  const missingPlank = variant === 1 ? 3 : -1;
  paintDiamond(pc, (x, y) => {
    const s = y - x / 2 + 16; // across planks
    const t = y + x / 2; // along planks
    const plank = Math.floor(s / plankWidth);
    if (s % plankWidth < 1) return '#1c1a19'; // gap between planks
    if ((t + offsets[plank % offsets.length]) % 10 < 0.8) return '#211e1d'; // plank ends
    if (plank === missingPlank && t > 6 && t < 18) return rng() < 0.2 ? '#1f1d1d' : '#121113'; // hole
    const r = rng();
    if (r < 0.06) return '#1d1b1b'; // burn marks
    if (r < 0.1) return '#423d39';
    return tones[plank % tones.length];
  });
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

/** Cobble street with sunken / missing stones showing dark earth, and a crack or two. */
function drawBrokenCobbleTile(variant: number): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(700 + variant * 19);
  const seeds: { x: number; y: number; tone: string; missing: boolean }[] = [];
  const tones = ['#3a3a40', '#36363c', '#3f3f46', '#333339'];
  while (seeds.length < 8) {
    const x = rng() * TW;
    const y = rng() * TH;
    if (inDiamond(Math.floor(x), Math.floor(y))) {
      seeds.push({ x, y, tone: tones[Math.floor(rng() * tones.length)], missing: rng() < 0.22 + variant * 0.08 });
    }
  }
  const cellAt = (x: number, y: number): number => {
    let best = 0;
    let bestDist = Infinity;
    seeds.forEach((s, i) => {
      const d = (x - s.x) ** 2 + ((y - s.y) * 2) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };
  paintDiamond(pc, (x, y) => {
    const cell = cellAt(x, y);
    const s = seeds[cell];
    if (s.missing) return rng() < 0.15 ? '#1e1e22' : rng() < 0.1 ? '#2f382c' : '#202024'; // earth, a little moss
    if (cellAt(x + 1, y) !== cell || cellAt(x, y + 1) !== cell) return '#202024';
    if (cellAt(x, y - 1) !== cell) return '#47474e';
    return rng() < 0.09 ? '#2e2e33' : s.tone;
  });
  if (variant === 2) {
    let x = 6;
    let y = 9;
    for (let i = 0; i < 18; i++) {
      if (inDiamond(x, y)) pc.pixel(x, y, '#141416');
      x += 1;
      y += rng() < 0.55 ? 0 : -1;
    }
  }
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

const PLAZA_TONES = ['#3d3d44', '#393940', '#42424a'];
const STONE_FLOOR_TONES = ['#34343a', '#303036', '#38383e'];

/**
 * Large square flagstones laid on the tile grid (2 x 2 slabs per tile, so slab joints line up from
 * tile to tile). Variant 1 is cracked, variant 2 has a broken slab with moss in the joints.
 */
function drawFlagstoneTile(variant: number, tones: readonly string[]): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(800 + variant * 23 + tones[0].charCodeAt(1));
  const slabTone = [0, 1, 2, 3].map(() => tones[Math.floor(rng() * tones.length)]);
  paintDiamond(pc, (x, y) => {
    // pixel -> tile-local (u, v) in [0, 1)
    const a = (x + 0.5 - TW / 2) / (TW / 2);
    const b = (y + 0.5) / (TH / 2);
    const u = (a + b) / 2;
    const v = (b - a) / 2;
    const su = Math.floor(u * 2);
    const sv = Math.floor(v * 2);
    const slab = Math.max(0, Math.min(3, sv * 2 + su));
    const fu = u * 2 - su;
    const fv = v * 2 - sv;
    if (fu < 0.07 || fv < 0.07) return variant === 2 && rng() < 0.4 ? '#2f382c' : '#29292e'; // joints
    if (fv < 0.14) return mixHex(slabTone[slab], '#ffffff', 0.03); // lit far edge
    if (variant === 2 && slab === 3 && fu > 0.3 && fv > 0.25) return rng() < 0.35 ? '#2a2a2f' : rng() < 0.2 ? '#2f382c' : '#303036'; // sunken broken slab
    const r = rng();
    if (r < 0.06) return mixHex(slabTone[slab], '#000000', 0.2);
    if (r < 0.1) return mixHex(slabTone[slab], '#ffffff', 0.04);
    return slabTone[slab];
  });
  if (variant === 1) {
    let x = 10;
    let y = 4;
    for (let i = 0; i < 14; i++) {
      if (inDiamond(x, y)) pc.pixel(x, y, '#18181b');
      x += rng() < 0.6 ? 1 : 0;
      y += 1 - (rng() < 0.35 ? 1 : 0);
    }
  }
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

/** Floor of a collapsed building: dark earth thick with broken stone and charred wood. */
function drawRubbleFloorTile(variant: number): HTMLCanvasElement {
  const pc = newTileCanvas();
  const rng = createRng(900 + variant * 29);
  paintDiamond(pc, () => (rng() < 0.12 ? '#1b1b1f' : '#232327'));
  for (let i = 0; i < 9; i++) {
    const x = 6 + Math.floor(rng() * 20);
    const y = 3 + Math.floor(rng() * 10);
    if (!inDiamond(x, y) || !inDiamond(x + 2, y + 1)) continue;
    const tone = ['#3c3c43', '#46464d', '#34302d'][i % 3];
    pc.rect(x, y, 2 + (i % 2), 1, tone);
    pc.rect(x, y + 1, 2 + (i % 2), 1, '#1e1e22');
  }
  paintSides(pc, rng);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------

function propCanvas(spec: ObjectArtSpec): PixelCanvas {
  return new PixelCanvas(spec.width, spec.height);
}

/** Soft contact shadow under a prop. Drawn last with destination-over. */
function groundShadow(pc: PixelCanvas, spec: ObjectArtSpec, rx: number, ry: number): void {
  pc.ctx.save();
  pc.ctx.globalCompositeOperation = 'destination-over';
  pc.fillEllipse(spec.anchorX, spec.anchorY, rx, ry, 'rgba(0,0,0,0.4)');
  pc.ctx.restore();
}

function drawRock(spec: ObjectArtSpec, seed: number): HTMLCanvasElement {
  const pc = propCanvas(spec);
  const rng = createRng(seed);
  const cx = spec.anchorX;
  const cy = spec.anchorY - spec.height * 0.28;
  const rx = spec.width * 0.4;
  const ry = spec.height * 0.42;
  for (let y = 0; y < spec.height; y++) {
    for (let x = 0; x < spec.width; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const edge = 1 + (rng() - 0.5) * 0.18;
      if (nx * nx + ny * ny > edge || y > spec.anchorY + 1) continue;
      const light = -nx * 0.6 - ny * 0.8;
      let color = light > 0.45 ? '#4d4d55' : light > -0.1 ? '#38383e' : '#26262b';
      if (rng() < 0.06) color = '#1e1e22';
      pc.pixel(x, y, color);
    }
  }
  pc.line(cx - 2, cy - 1, cx + 1, cy + 2, '#1e1e22');
  groundShadow(pc, spec, rx + 1, 2.5);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawDeadTree(): HTMLCanvasElement {
  const spec = OBJECT_ART.dead_tree;
  const pc = propCanvas(spec);
  const bark = '#1f1f23';
  pc.line(16, 44, 15, 20, bark, 3);
  pc.line(13, 43, 10, 45, bark, 2);
  pc.line(18, 43, 22, 45, bark, 2);
  pc.line(15, 28, 8, 18, bark, 2);
  pc.line(8, 18, 5, 10, bark, 1);
  pc.line(8, 18, 3, 16, bark, 1);
  pc.line(16, 25, 23, 14, bark, 2);
  pc.line(23, 14, 26, 6, bark, 1);
  pc.line(23, 14, 28, 15, bark, 1);
  pc.line(15, 20, 14, 8, bark, 2);
  pc.line(14, 8, 12, 2, bark, 1);
  pc.line(14, 12, 18, 5, bark, 1);
  pc.rimLight('#34343a');
  groundShadow(pc, spec, 7, 2);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawPillar(): HTMLCanvasElement {
  const spec = OBJECT_ART.pillar;
  const pc = propCanvas(spec);
  const rng = createRng(77);
  pc.rect(1, 31, 18, 6, '#3c3c43');
  pc.rect(1, 36, 18, 1, '#26262b');
  pc.rect(4, 8, 12, 24, '#4b4b53');
  pc.rect(13, 8, 3, 24, '#38383f');
  for (const fx of [6, 9, 12]) pc.rect(fx, 9, 1, 22, '#3e3e45');
  pc.rect(2, 4, 16, 5, '#55555d');
  pc.rect(2, 8, 16, 1, '#2e2e34');
  pc.rect(15, 4, 3, 5, '#414148');
  pc.ctx.clearRect(2, 4, 2, 1); // chipped corner
  for (let i = 0; i < 6; i++) {
    pc.pixel(5 + Math.floor(rng() * 9), 10 + Math.floor(rng() * 20), '#2a2a30');
  }
  pc.rimLight('#62626b');
  groundShadow(pc, spec, 10, 3);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawBrokenPillar(): HTMLCanvasElement {
  const spec = OBJECT_ART.pillar_broken;
  const pc = propCanvas(spec);
  const rng = createRng(78);
  pc.rect(2, 19, 18, 6, '#3c3c43');
  pc.rect(2, 24, 18, 1, '#26262b');
  for (let x = 5; x < 17; x++) {
    const topY = 5 + Math.floor(rng() * 6);
    pc.rect(x, topY, 1, 20 - topY, x >= 14 ? '#38383f' : '#4b4b53');
  }
  pc.rect(0, 22, 3, 2, '#34343a');
  pc.rect(19, 21, 3, 3, '#3a3a40');
  pc.rimLight('#62626b');
  groundShadow(pc, spec, 10, 3);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawBrazier(): HTMLCanvasElement {
  const spec = OBJECT_ART.brazier;
  const pc = propCanvas(spec);
  const iron = '#2a2a30';
  pc.line(4, 17, 6, 11, iron);
  pc.line(12, 17, 10, 11, iron);
  pc.line(8, 17, 8, 12, iron);
  pc.rect(3, 8, 10, 3, iron);
  pc.rect(4, 11, 8, 1, '#1e1e22');
  pc.rect(3, 8, 10, 1, '#3c3c43');
  // embers: mostly grey ash, a couple of muted purple coals (accent)
  pc.rect(4, 7, 8, 1, '#5a5a62');
  pc.pixel(6, 7, PALETTE.accent);
  pc.pixel(9, 7, PALETTE.accentLight);
  pc.pixel(7, 6, '#7a7a82');
  groundShadow(pc, spec, 5, 1.5);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function drawShrine(): HTMLCanvasElement {
  const spec = OBJECT_ART.shrine;
  const pc = propCanvas(spec);
  pc.rect(1, 32, 14, 5, '#2e2e34');
  pc.rect(1, 36, 14, 1, '#1c1c20');
  for (let y = 6; y < 32; y++) {
    const w = 6 + Math.floor(((y - 6) / 26) * 4);
    const x = 8 - Math.floor(w / 2);
    pc.rect(x, y, w, 1, '#26262c');
    pc.rect(x + w - 2, y, 2, 1, '#1d1d22');
  }
  pc.rect(6, 3, 4, 3, '#26262c');
  pc.rect(7, 1, 2, 2, '#26262c');
  const rune = '#7d6b9a';
  for (const [x, y] of [
    [7, 11],
    [8, 13],
    [7, 15],
    [8, 18],
    [7, 21],
    [8, 24],
    [7, 27],
  ]) {
    pc.pixel(x, y, rune);
  }
  pc.rimLight('#3c3c44');
  groundShadow(pc, spec, 8, 2.5);
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

// ---------------------------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------------------------

/** Ordered-dither soft blob made from a few overlapping lobes. Not upscaled: sprites scale it. */
function drawDitherBlob(w: number, h: number, color: string, lobes: number, seed: number, gain: number): HTMLCanvasElement {
  const pc = new PixelCanvas(w, h);
  const rng = createRng(seed);
  const parts = Array.from({ length: lobes }, (_, i) => ({
    x: i === 0 ? w / 2 : w * (0.3 + rng() * 0.4),
    y: i === 0 ? h / 2 : h * (0.35 + rng() * 0.3),
    rx: w * (i === 0 ? 0.5 : 0.25 + rng() * 0.15),
    ry: h * (i === 0 ? 0.5 : 0.3 + rng() * 0.15),
  }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (const p of parts) {
        const d = Math.hypot((x + 0.5 - p.x) / p.rx, (y + 0.5 - p.y) / p.ry);
        v = Math.max(v, 1 - d);
      }
      if (v * gain > bayerThreshold(x, y)) pc.pixel(x, y, color);
    }
  }
  return pc.canvas;
}

function drawGlow(): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is not available.');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(150, 134, 179, 0.85)');
  g.addColorStop(0.5, 'rgba(111, 95, 140, 0.3)');
  g.addColorStop(1, 'rgba(111, 95, 140, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function drawVignette(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is not available.');
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  // Draw an elliptical gradient by squashing a circular one vertically.
  ctx.setTransform(1, 0, 0, GAME_HEIGHT / GAME_WIDTH, 0, cy - (cy * GAME_HEIGHT) / GAME_WIDTH);
  const g = ctx.createRadialGradient(cx, cy, GAME_WIDTH * 0.22, cx, cy, GAME_WIDTH * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.65, 'rgba(4,4,6,0.3)');
  g.addColorStop(1, 'rgba(4,4,6,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(-GAME_WIDTH, -GAME_WIDTH, GAME_WIDTH * 3, GAME_WIDTH * 3);
  return canvas;
}
