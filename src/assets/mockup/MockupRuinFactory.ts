import type Phaser from 'phaser';
import { MOCKUP_PIXEL_SCALE } from '../../config/constants';
import { PALETTE } from '../../config/palette';
import { TextureKeys, type DecorTextureId } from '../TextureKeys';
import { bayerThreshold, createRng, mixHex, PixelCanvas } from './PixelCanvas';

/**
 * TEMPORARY procedural art for the ruined medieval city (props + flat ground details), in the same
 * style as MockupEnvironmentFactory: half-resolution pixels upscaled x2, desaturated greys, charred
 * timber, muted moss, very sparing purple / dried-red accents. Same 2:1 projection as the tiles:
 * one tile step along +x is (+16, +8) logical px, along +y (-16, +8).
 */

/** Logical size and ground-contact anchor (footprint centre) of each prop. */
export interface RuinArtSpec {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

export type RuinObjectId =
  | 'barrel'
  | 'barrels'
  | 'crate'
  | 'crate_stack'
  | 'rubble_heap'
  | 'beam_pile'
  | 'statue_broken'
  | 'tombstone'
  | 'fence_x'
  | 'fence_y'
  | 'table_broken'
  | 'stairs_ruin'
  | 'gate_tower'
  | 'cart_broken'
  | 'fallen_column'
  | 'altar'
  | 'rubble_mound'
  | 'monument'
  | 'bell_tower'
  | 'city_gate'
  | 'city_wall'
  | 'city_wall_broken'
  | 'city_tower';

export const RUIN_OBJECT_ART: Readonly<Record<RuinObjectId, RuinArtSpec>> = {
  barrel: { width: 14, height: 20, anchorX: 7, anchorY: 16 },
  barrels: { width: 28, height: 22, anchorX: 14, anchorY: 16 },
  crate: { width: 22, height: 20, anchorX: 11, anchorY: 14 },
  crate_stack: { width: 26, height: 30, anchorX: 13, anchorY: 22 },
  rubble_heap: { width: 32, height: 22, anchorX: 16, anchorY: 14 },
  beam_pile: { width: 34, height: 22, anchorX: 17, anchorY: 14 },
  statue_broken: { width: 22, height: 46, anchorX: 11, anchorY: 39 },
  tombstone: { width: 14, height: 18, anchorX: 7, anchorY: 14 },
  fence_x: { width: 30, height: 22, anchorX: 15, anchorY: 14 },
  fence_y: { width: 30, height: 22, anchorX: 15, anchorY: 14 },
  table_broken: { width: 24, height: 18, anchorX: 12, anchorY: 12 },
  stairs_ruin: { width: 32, height: 30, anchorX: 16, anchorY: 21 },
  gate_tower: { width: 30, height: 78, anchorX: 15, anchorY: 69 },
  cart_broken: { width: 50, height: 34, anchorX: 25, anchorY: 20 },
  fallen_column: { width: 48, height: 28, anchorX: 24, anchorY: 15 },
  altar: { width: 46, height: 34, anchorX: 23, anchorY: 20 },
  rubble_mound: { width: 66, height: 44, anchorX: 33, anchorY: 26 },
  monument: { width: 100, height: 96, anchorX: 50, anchorY: 62 },
  bell_tower: { width: 64, height: 150, anchorX: 32, anchorY: 128 },
  // City wall (procedural fallbacks; hand-made art replaces them when loaded - see HandmadeArt)
  city_gate: { width: 160, height: 150, anchorX: 80, anchorY: 112 },
  city_wall: { width: 84, height: 96, anchorX: 42, anchorY: 74 },
  city_wall_broken: { width: 84, height: 96, anchorX: 42, anchorY: 74 },
  city_tower: { width: 68, height: 116, anchorX: 34, anchorY: 98 },
};

const C = {
  outline: '#121215',
  stoneLight: '#5c5c64',
  stone: '#4b4b53',
  stoneDark: '#38383f',
  stoneDeep: '#26262b',
  mortar: '#2b2b30',
  gothic: '#4a4a53',
  gothicDark: '#35353d',
  gothicDeep: '#25252c',
  woodLight: '#4a423b',
  wood: '#3a3430',
  woodDark: '#2a2522',
  beam: '#252220',
  charred: '#18161a',
  iron: '#2a2a30',
  ironLight: '#45454d',
  moss: '#2f382c',
  mossLight: '#3b4534',
  void: '#0b0b0d',
  rust: '#4a3434',
} as const;

// ---------------------------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------------------------

type Pt = [number, number];

/** Pixel-exact polygon fill (pixel centres, even-odd): no anti-aliased edges. */
function fillPoly(pc: PixelCanvas, pts: Pt[], color: string | ((x: number, y: number) => string | null)): void {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      if (!inPoly(x + 0.5, y + 0.5, pts)) continue;
      const c = typeof color === 'string' ? color : color(x, y);
      if (c) pc.pixel(x, y, c);
    }
  }
}

function inPoly(x: number, y: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Screen offset (logical px) of a tile-space step. */
const iso = (dx: number, dy: number): Pt => [(dx - dy) * 16, (dx + dy) * 8];

interface Faces {
  top: (x: number, y: number) => string | null;
  /** Face along the +x edge (lower-left on screen). v = height above the ground line. */
  left: (x: number, v: number, y: number) => string | null;
  /** Face along the +y edge (lower-right on screen). */
  right: (x: number, v: number, y: number) => string | null;
}

/**
 * Isometric box standing on a ground footprint of fx x fy tiles centred at (cx, cy), `h` px tall.
 * Returns the four top corners (top, right, bottom, left).
 */
function isoBox(pc: PixelCanvas, cx: number, cy: number, fx: number, fy: number, h: number, faces: Faces): Pt[] {
  const corner = (sx: number, sy: number): Pt => {
    const [ox, oy] = iso(sx * fx * 0.5, sy * fy * 0.5);
    return [cx + ox, cy + oy];
  };
  const top = corner(-1, -1);
  const right = corner(1, -1);
  const bottom = corner(1, 1);
  const left = corner(-1, 1);
  const up = (p: Pt): Pt => [p[0], p[1] - h];
  // left face: left -> bottom edge
  const lineY = (a: Pt, b: Pt, x: number): number => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  fillPoly(pc, [left, bottom, up(bottom), up(left)], (x, y) => faces.left(x, lineY(left, bottom, x + 0.5) - (y + 0.5), y));
  fillPoly(pc, [bottom, right, up(right), up(bottom)], (x, y) => faces.right(x, lineY(bottom, right, x + 0.5) - (y + 0.5), y));
  fillPoly(pc, [up(top), up(right), up(bottom), up(left)], faces.top);
  return [up(top), up(right), up(bottom), up(left)];
}

/** Coursed masonry face colours. */
function masonry(base: string, rng: () => number, course = 3, joint = 6): (x: number, v: number) => string {
  return (x, v) => {
    const row = Math.floor(v / course);
    if (v % course >= course - 0.8) return C.mortar;
    if ((Math.floor(x) + (row % 2) * 3) % joint === 0) return C.mortar;
    if (v < 2 && rng() < 0.35) return C.moss;
    const r = rng();
    if (r < 0.08) return mixHex(base, '#000000', 0.22);
    if (r < 0.14) return mixHex(base, '#ffffff', 0.06);
    return base;
  };
}

function noisy(base: string, rng: () => number, dark = 0.07): (x: number, y: number) => string {
  return () => (rng() < dark ? mixHex(base, '#000000', 0.25) : rng() < 0.05 ? mixHex(base, '#ffffff', 0.07) : base);
}

function shadow(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, alpha = 0.4): void {
  pc.ctx.save();
  pc.ctx.globalCompositeOperation = 'destination-over';
  pc.fillEllipse(cx, cy, rx, ry, `rgba(0,0,0,${alpha})`);
  pc.ctx.restore();
}

/**
 * Heap of broken masonry: a dark dusty base with dozens of small stone blocks (and a few charred
 * planks) piled into a dome, drawn back to front so nearer blocks overlap farther ones.
 */
function rubbleMound(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, height: number, seed: number): void {
  const rng = createRng(seed);
  // dusty base
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d < 1 && rng() > d * d * 0.7) pc.pixel(x, y, rng() < 0.3 ? '#2a2a2f' : '#222226');
    }
  }
  interface Block {
    x: number;
    y: number;
    z: number;
    s: number;
    h: number;
    wood: boolean;
  }
  const blocks: Block[] = [];
  const count = Math.round(rx * ry * 0.55);
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.pow(rng(), 0.75);
    const dx = Math.cos(ang) * rad * rx * 0.85;
    const dy = Math.sin(ang) * rad * ry * 0.85;
    blocks.push({
      x: cx + dx,
      y: cy + dy,
      z: height * (1 - rad * rad) * (0.55 + rng() * 0.45),
      s: 0.08 + rng() * 0.1,
      h: 1 + Math.floor(rng() * 3),
      wood: rng() < 0.1,
    });
  }
  blocks.sort((a, b) => a.y - b.y || a.z - b.z);
  const stones = ['#43434a', '#3d3d44', '#48484f', '#37373e'];
  for (const b of blocks) {
    const tone = b.wood ? C.woodDark : stones[Math.floor(rng() * stones.length)];
    const lit = mixHex(tone, '#ffffff', b.wood ? 0.04 : 0.07);
    const dark = mixHex(tone, '#000000', 0.3);
    isoBox(pc, Math.round(b.x), Math.round(b.y - b.z), b.wood ? b.s * 2.4 : b.s, b.s, b.h, {
      top: () => lit,
      left: () => tone,
      right: () => dark,
    });
  }
}

function finish(pc: PixelCanvas): HTMLCanvasElement {
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}

function canvasFor(id: RuinObjectId): { pc: PixelCanvas; spec: RuinArtSpec } {
  const spec = RUIN_OBJECT_ART[id];
  return { pc: new PixelCanvas(spec.width, spec.height), spec };
}

// ---------------------------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------------------------

function drawCrateAt(pc: PixelCanvas, cx: number, cy: number, size: number, h: number, seed: number): void {
  const rng = createRng(seed);
  const plank = (base: string) => (_x: number, v: number) => {
    if (v < 1 || v > h - 1.2) return C.beam;
    if (Math.floor(v) % 3 === 0) return mixHex(base, '#000000', 0.3);
    return rng() < 0.08 ? C.charred : base;
  };
  const top = isoBox(pc, cx, cy, size, size, h, { top: noisy(C.woodLight, rng), left: plank(C.wood), right: plank(C.woodDark) });
  // corner brace
  pc.line(top[3][0], top[3][1] + 1, top[2][0], top[2][1] + h - 1, C.beam);
}

function drawCrate(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('crate');
  drawCrateAt(pc, spec.anchorX, spec.anchorY, 0.55, 8, 3);
  shadow(pc, spec.anchorX, spec.anchorY + 1, 9, 3);
  return finish(pc);
}

function drawCrateStack(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('crate_stack');
  drawCrateAt(pc, spec.anchorX - 3, spec.anchorY - 1, 0.42, 7, 4);
  drawCrateAt(pc, spec.anchorX + 4, spec.anchorY + 1, 0.42, 7, 5);
  drawCrateAt(pc, spec.anchorX, spec.anchorY - 7, 0.4, 6, 6);
  shadow(pc, spec.anchorX, spec.anchorY + 2, 12, 4);
  return finish(pc);
}

function drawBarrelAt(pc: PixelCanvas, cx: number, by: number, seed: number): void {
  const rng = createRng(seed);
  const w = 5;
  const h = 12;
  for (let x = -w; x <= w; x++) {
    const bulge = x === -w || x === w ? 1 : 0;
    for (let y = by - h + bulge; y <= by - bulge; y++) {
      const v = by - y;
      let c: string = x < -1 ? C.woodLight : x < 2 ? C.wood : C.woodDark;
      if ((x + 7) % 3 === 0) c = mixHex(c, '#000000', 0.2); // staves
      if (v === 2 || v === 3 || v === h - 3 || v === h - 2) c = x < 0 ? C.ironLight : C.iron; // hoops
      if (rng() < 0.05) c = C.charred;
      pc.pixel(cx + x, y, c);
    }
  }
  pc.fillEllipse(cx + 0.5, by - h, w + 0.5, 2, C.woodDark);
  pc.fillEllipse(cx + 0.5, by - h, w - 1, 1.2, C.beam);
}

function drawBarrel(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('barrel');
  drawBarrelAt(pc, spec.anchorX, spec.anchorY + 1, 1);
  shadow(pc, spec.anchorX, spec.anchorY + 1, 6, 2);
  return finish(pc);
}

function drawBarrels(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('barrels');
  drawBarrelAt(pc, spec.anchorX - 6, spec.anchorY - 1, 2);
  drawBarrelAt(pc, spec.anchorX + 5, spec.anchorY + 1, 3);
  // a third barrel tipped over in front
  const rng = createRng(9);
  for (let x = -6; x <= 6; x++) {
    for (let y = -3; y <= 3; y++) {
      let c: string = y < -1 ? C.woodLight : y < 2 ? C.wood : C.woodDark;
      if (x === -4 || x === 4) c = C.iron;
      if (rng() < 0.05) c = C.charred;
      pc.pixel(spec.anchorX - 2 + x, spec.anchorY + 3 + y, c);
    }
  }
  pc.fillEllipse(spec.anchorX - 8.5, spec.anchorY + 3.5, 1.5, 3.5, C.beam);
  shadow(pc, spec.anchorX, spec.anchorY + 3, 13, 4);
  return finish(pc);
}

function drawRubbleHeap(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('rubble_heap');
  rubbleMound(pc, spec.anchorX, spec.anchorY, 13, 5, 8, 21);
  pc.line(spec.anchorX - 9, spec.anchorY - 4, spec.anchorX + 3, spec.anchorY - 9, C.beam, 2);
  pc.line(spec.anchorX - 9, spec.anchorY - 5, spec.anchorX + 3, spec.anchorY - 10, C.woodDark);
  shadow(pc, spec.anchorX, spec.anchorY + 1, 15, 5);
  return finish(pc);
}

function drawRubbleMound(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('rubble_mound');
  rubbleMound(pc, spec.anchorX, spec.anchorY, 29, 11, 16, 44);
  // broken masonry block and charred rafters sticking out
  const rng = createRng(45);
  isoBox(pc, spec.anchorX + 9, spec.anchorY - 9, 0.45, 0.3, 7, { top: noisy(C.stoneLight, rng), left: masonry(C.stone, rng), right: masonry(C.stoneDark, rng) });
  pc.line(spec.anchorX - 20, spec.anchorY - 6, spec.anchorX - 4, spec.anchorY - 20, C.beam, 2);
  pc.line(spec.anchorX - 20, spec.anchorY - 7, spec.anchorX - 4, spec.anchorY - 21, C.woodDark);
  pc.line(spec.anchorX + 2, spec.anchorY - 14, spec.anchorX + 20, spec.anchorY - 4, C.beam, 2);
  pc.line(spec.anchorX - 10, spec.anchorY + 2, spec.anchorX + 4, spec.anchorY - 2, C.charred);
  shadow(pc, spec.anchorX, spec.anchorY + 2, 31, 11);
  return finish(pc);
}

function drawBeamPile(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('beam_pile');
  const a = spec.anchorX;
  const b = spec.anchorY;
  const beam = (x0: number, y0: number, x1: number, y1: number): void => {
    pc.line(x0, y0 + 1, x1, y1 + 1, C.charred, 3);
    pc.line(x0, y0, x1, y1, C.beam, 2);
    pc.line(x0, y0 - 1, x1, y1 - 1, C.woodDark);
  };
  beam(a - 14, b - 2, a + 10, b + 4);
  beam(a - 10, b + 5, a + 13, b - 6);
  beam(a - 8, b - 7, a + 6, b - 1);
  beam(a - 3, b - 10, a + 12, b - 3);
  pc.pixel(a + 2, b - 4, C.rust);
  shadow(pc, a, b + 1, 15, 5);
  return finish(pc);
}

function drawStatueBroken(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('statue_broken');
  const rng = createRng(61);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const top = isoBox(pc, a, b, 0.62, 0.62, 8, { top: noisy(C.stoneLight, rng), left: masonry(C.stone, rng, 4, 20), right: masonry(C.stoneDark, rng, 4, 20) });
  const baseY = Math.round((top[0][1] + top[2][1]) / 2);
  // robed figure, headless, one arm broken off
  for (let y = 0; y < 27; y++) {
    const w = 3 + Math.floor(y / 6);
    for (let x = -w; x <= w; x++) {
      let c: string = x < -1 ? C.stoneLight : x < 2 ? C.stone : C.stoneDark;
      if ((x + y) % 7 === 0 && y > 8) c = mixHex(c, '#000000', 0.25); // robe folds
      if (rng() < 0.05) c = C.stoneDeep;
      pc.pixel(a + x, baseY - 27 + y, c);
    }
  }
  pc.rect(a - 2, baseY - 29, 5, 2, C.stoneDark); // broken neck
  pc.pixel(a - 1, baseY - 30, C.stoneDeep);
  pc.line(a + 4, baseY - 23, a + 7, baseY - 18, C.stoneDark, 2); // stump of the right arm
  pc.line(a - 4, baseY - 22, a - 6, baseY - 13, C.stone, 2);
  pc.rimLight('#6a6a73');
  pc.pixel(a - 6, b - 2, C.mossLight);
  pc.pixel(a + 5, b - 1, C.moss);
  shadow(pc, a, b + 1, 10, 3);
  return finish(pc);
}

function drawTombstone(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('tombstone');
  const rng = createRng(71);
  const a = spec.anchorX;
  const b = spec.anchorY;
  for (let y = 0; y < 11; y++) {
    for (let x = -3; x <= 3; x++) {
      if (y < 2 && Math.abs(x) === 3) continue;
      if (y === 0 && Math.abs(x) === 2) continue;
      const lean = y < 5 ? 1 : 0; // tilted
      let c: string = x < 0 ? C.stone : x < 2 ? C.stoneDark : C.stoneDeep;
      if (rng() < 0.08) c = C.moss;
      pc.pixel(a + x + lean, b - 11 + y, c);
    }
  }
  pc.pixel(a + 1, b - 8, C.stoneDeep); // engraved cross
  pc.rect(a, b - 7, 3, 1, C.stoneDeep);
  pc.pixel(a + 1, b - 6, C.stoneDeep);
  pc.rimLight('#62626b');
  pc.rect(a - 4, b, 9, 1, C.moss);
  shadow(pc, a, b, 5, 2);
  return finish(pc);
}

function drawFence(mirror: boolean): HTMLCanvasElement {
  const { pc, spec } = canvasFor(mirror ? 'fence_y' : 'fence_x');
  const a = spec.anchorX;
  const b = spec.anchorY;
  const mx = (x: number): number => (mirror ? 2 * a - x : x);
  const pt = (t: number): Pt => [a - 13 + 26 * t, b - 6.5 + 13 * t]; // along +x through the tile centre
  const rng = createRng(mirror ? 82 : 81);
  const posts = [0.05, 0.5, 0.92];
  posts.forEach((t, i) => {
    const [x, y] = pt(t);
    const h = i === 2 ? 6 : 10 + Math.floor(rng() * 2);
    pc.line(mx(x), y, mx(x), y - h, C.beam, 2);
    pc.pixel(mx(x) - (mirror ? 1 : 0), y - h, C.woodLight);
  });
  for (const [h, from, to] of [
    [4, 0.05, 0.92],
    [8, 0.05, 0.62],
  ] as const) {
    const [x0, y0] = pt(from);
    const [x1, y1] = pt(to);
    pc.line(mx(x0), y0 - h, mx(x1), y1 - h, C.wood);
    pc.line(mx(x0), y0 - h - 1, mx(x1), y1 - h - 1, C.woodLight);
  }
  // broken rail hanging down
  const [x2, y2] = pt(0.66);
  pc.line(mx(x2), y2 - 8, mx(x2 + 6), y2 - 1, C.woodDark);
  shadow(pc, a, b, 13, 4, 0.3);
  return finish(pc);
}

function drawTableBroken(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('table_broken');
  const rng = createRng(91);
  const a = spec.anchorX;
  const b = spec.anchorY;
  // legs
  for (const [dx, dy, h] of [
    [-7, -1, 6],
    [5, -3, 6],
    [-2, 3, 6],
  ] as const) {
    pc.line(a + dx, b + dy, a + dx, b + dy - h, C.beam);
  }
  // tilted top (one leg missing)
  isoBox(pc, a, b - 6, 0.72, 0.42, 2, {
    top: (x, y) => (rng() < 0.1 ? C.charred : (x + y) % 4 === 0 ? C.wood : C.woodLight),
    left: () => C.woodDark,
    right: () => C.beam,
  });
  // broken stool on its side
  pc.rect(a + 6, b + 1, 4, 2, C.wood);
  pc.pixel(a + 10, b, C.beam);
  pc.pixel(a + 6, b + 3, C.beam);
  shadow(pc, a, b + 1, 10, 3);
  return finish(pc);
}

function drawStairsRuin(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('stairs_ruin');
  const rng = createRng(101);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const faces = (): Faces => ({ top: noisy(C.stoneLight, rng), left: masonry(C.stone, rng, 3, 7), right: masonry(C.stoneDark, rng, 3, 7) });
  // steps rising towards -y (up-right on screen), the top step broken off
  isoBox(pc, a, b, 0.86, 0.86, 3, faces());
  const [ox, oy] = iso(0, -0.14);
  isoBox(pc, a + ox, b + oy, 0.86, 0.58, 7, faces());
  const [qx, qy] = iso(0, -0.28);
  isoBox(pc, a + qx, b + qy, 0.86, 0.3, 11, faces());
  // broken corner
  pc.ctx.clearRect(a + 8, b - 23, 6, 5);
  pc.pixel(a + 7, b - 18, C.stoneDeep);
  shadow(pc, a, b + 1, 15, 5);
  return finish(pc);
}

function drawGateTower(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('gate_tower');
  const rng = createRng(111);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const h = 52;
  isoBox(pc, a, b, 0.84, 0.84, h, { top: noisy(C.stoneDeep, rng), left: masonry('#45454c', rng, 4, 7), right: masonry('#36363d', rng, 4, 7) });
  // ragged broken top
  for (let x = 0; x < spec.width; x++) {
    const cut = Math.round(5 + Math.abs(Math.sin(x * 0.7 + 1)) * 9 + (x > a - 4 ? (x - a + 4) * 1.1 : 0) + rng() * 3);
    pc.ctx.clearRect(x, 0, 1, b - h - 14 + cut);
  }
  // arrow slits
  pc.rect(a - 7, b - 34, 1, 6, C.void);
  pc.rect(a + 6, b - 30, 1, 6, C.void);
  // rubble at the foot
  rubbleMound(pc, a + 7, b + 2, 6, 2, 3, 112);
  pc.rimLight('#62626b');
  shadow(pc, a, b + 1, 14, 5);
  return finish(pc);
}

function drawCartBroken(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('cart_broken');
  const rng = createRng(121);
  const a = spec.anchorX;
  const b = spec.anchorY;
  // bed raised on the axle, tilted down at the front where a wheel is missing
  const bedTop = isoBox(pc, a, b - 6, 1.7, 0.66, 3, {
    top: (x, y) => ((x * 2 + y) % 5 === 0 ? C.woodDark : rng() < 0.08 ? C.charred : C.wood),
    left: () => C.woodDark,
    right: () => C.beam,
  });
  // side board (broken)
  pc.line(bedTop[3][0], bedTop[3][1] - 2, bedTop[2][0] - 8, bedTop[2][1] - 6, C.woodLight);
  pc.line(bedTop[3][0], bedTop[3][1] - 3, bedTop[2][0] - 8, bedTop[2][1] - 7, C.wood);
  // wheel on the visible side
  const wx = a - 8;
  const wy = b - 2;
  for (let t = 0; t < 40; t++) {
    const ang = (t / 40) * Math.PI * 2;
    pc.pixel(Math.round(wx + Math.cos(ang) * 4), Math.round(wy + Math.sin(ang) * 5), C.beam);
  }
  pc.line(wx - 3, wy - 4, wx + 3, wy + 4, C.woodDark);
  pc.line(wx + 3, wy - 4, wx - 3, wy + 4, C.woodDark);
  pc.pixel(wx, wy, C.iron);
  // the other wheel lies flat on the ground
  pc.fillEllipse(a + 14, b + 6, 5, 2.5, C.beam);
  pc.fillEllipse(a + 14, b + 6, 3, 1.4, C.charred);
  // shafts
  pc.line(a - 22, b - 9, a - 34 + 14, b - 2, C.beam);
  pc.line(a - 18, b - 11, a - 24, b - 7, C.woodDark);
  shadow(pc, a, b + 2, 22, 7);
  return finish(pc);
}

function drawFallenColumn(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('fallen_column');
  const rng = createRng(131);
  const a = spec.anchorX;
  const b = spec.anchorY;
  // cylinder lying along +x: axis from (a-14, b-7) to (a+14, b+7), radius 5
  const r = 5;
  for (let s = -r; s <= r; s++) {
    const shade = s < -2 ? C.stone : s < 2 ? '#424249' : C.stoneDark;
    pc.line(a - 15 + s * 0.45, b - 7 - 3 + s, a + 9 + s * 0.45, b + 5 - 3 + s, shade);
  }
  // fluting
  for (const s of [-3, 0, 3]) pc.line(a - 14 + s * 0.45, b - 10 + s, a + 8 + s * 0.45, b + 2 + s, mixHex(C.stone, '#000000', 0.2));
  // broken end (cap) and a separate drum
  pc.fillEllipse(a - 15, b - 10, 3, 5, C.stone);
  pc.fillEllipse(a - 15, b - 10, 1.5, 3, C.stoneDark);
  pc.fillEllipse(a + 16, b + 5, 4, 5.5, C.stone);
  pc.fillEllipse(a + 15, b + 4, 2.5, 4, '#4f4f57');
  for (let i = 0; i < 6; i++) pc.pixel(a - 10 + Math.floor(rng() * 20), b - 6 + Math.floor(rng() * 8), C.stoneDeep);
  pc.pixel(a - 4, b + 1, C.moss);
  shadow(pc, a, b + 2, 22, 6);
  return finish(pc);
}

function drawAltar(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('altar');
  const rng = createRng(141);
  const a = spec.anchorX;
  const b = spec.anchorY;
  isoBox(pc, a, b, 1.7, 0.8, 9, { top: noisy(C.gothicDark, rng), left: masonry(C.gothic, rng, 3, 9), right: masonry(C.gothicDark, rng, 3, 9) });
  const top = isoBox(pc, a, b - 9, 1.85, 0.92, 2, { top: noisy('#5a5a64', rng, 0.1), left: () => '#55555e', right: () => C.gothicDark });
  // crack across the slab, a few melted candle stubs, faint purple runes
  pc.line(top[3][0] + 8, top[3][1] - 1, top[1][0] - 12, top[1][1] + 4, C.gothicDeep);
  for (const [dx, dy] of [
    [-8, -2],
    [-3, 0],
    [6, -4],
  ]) {
    pc.rect(a + dx, b - 13 + dy, 1, 2, '#8a8478');
    pc.pixel(a + dx, b - 14 + dy, '#a89a7c');
  }
  pc.pixel(a - 12, b - 3, PALETTE.accent);
  pc.pixel(a - 8, b - 1, PALETTE.accentDim);
  pc.pixel(a + 9, b - 2, PALETTE.accent);
  shadow(pc, a, b + 2, 22, 8);
  return finish(pc);
}

function drawMonument(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('monument');
  const rng = createRng(151);
  const a = spec.anchorX;
  const b = spec.anchorY;
  // three stepped tiers
  const t1 = isoBox(pc, a, b, 2.7, 2.7, 4, { top: noisy('#4f4f57', rng), left: masonry(C.stone, rng, 4, 8), right: masonry(C.stoneDark, rng, 4, 8) });
  const y1 = (t1[0][1] + t1[2][1]) / 2;
  const t2 = isoBox(pc, a, y1, 1.9, 1.9, 5, { top: noisy('#55555d', rng), left: masonry(C.stone, rng, 5, 8), right: masonry(C.stoneDark, rng, 5, 8) });
  const y2 = (t2[0][1] + t2[2][1]) / 2;
  // pedestal with a faint rune band
  const t3 = isoBox(pc, a, y2, 0.95, 0.95, 26, {
    top: noisy(C.stoneLight, rng),
    left: (x, v) => (Math.round(v) === 16 && x % 3 === 0 ? PALETTE.accent : masonry(C.stone, rng, 6, 12)(x, v)),
    right: (x, v) => (Math.round(v) === 16 && x % 3 === 1 ? PALETTE.accentDim : masonry(C.stoneDark, rng, 6, 12)(x, v)),
  });
  const y3 = Math.round((t3[0][1] + t3[2][1]) / 2);
  // what is left of a knight: legs, a cloak hem, a broken sword stuck in the plinth
  for (let y = 0; y < 16; y++) {
    for (const leg of [-3, 2]) {
      for (let x = 0; x < 3; x++) {
        let c: string = leg < 0 ? C.stone : C.stoneDark;
        if (x === 0 && leg < 0) c = C.stoneLight;
        pc.pixel(a + leg + x, y3 - 16 + y, c);
      }
    }
  }
  for (let x = -5; x <= 5; x++) pc.pixel(a + x, y3 - 16 + Math.abs(x) % 2, C.stoneDark); // broken hips
  pc.line(a + 7, y3 - 2, a + 9, y3 - 20, C.ironLight); // sword
  pc.line(a + 6, y3 - 15, a + 12, y3 - 16, C.iron);
  // the toppled torso and head on the lower step
  isoBox(pc, a - 20, b + 2, 0.35, 0.5, 6, { top: noisy(C.stoneLight, rng), left: () => C.stone, right: () => C.stoneDark });
  pc.fillEllipse(a + 22, b + 4, 3, 2.5, C.stone);
  pc.fillEllipse(a + 21, b + 3, 1.5, 1.2, C.stoneLight);
  rubbleMound(pc, a + 30, b - 3, 7, 3, 4, 152);
  rubbleMound(pc, a - 30, b - 6, 6, 3, 3, 153);
  pc.rimLight('#666670');
  shadow(pc, a, b + 4, 44, 16, 0.35);
  return finish(pc);
}

function drawBellTower(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('bell_tower');
  const rng = createRng(161);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const h = 96;
  const faces: Faces = {
    top: noisy(C.gothicDark, rng),
    left: (x, v, y) => belfry(x, v, y, 'left') ?? masonry(C.gothic, rng, 4, 7)(x, v),
    right: (x, v, y) => belfry(x, v, y, 'right') ?? masonry(C.gothicDark, rng, 4, 7)(x, v),
  };
  function belfry(x: number, v: number, _y: number, side: 'left' | 'right'): string | null {
    // pointed belfry openings near the top, a string course below them, a lancet slit lower down
    if (Math.round(v) === 62 || Math.round(v) === 63) return side === 'left' ? '#5e5e68' : '#4a4a53';
    const local = side === 'left' ? x - (a - 27) : x - a;
    for (const c of [8, 19]) {
      const dx = Math.abs(local - c);
      if (dx <= 3 && v > 66 && v < 82 - dx * 1.5) return dx > 2.4 ? '#5e5e68' : C.void;
    }
    if (side === 'left' && Math.abs(local - 13) <= 1 && v > 30 && v < 44) return C.void;
    return null;
  }
  isoBox(pc, a, b, 1.66, 1.66, h, faces);
  // the bell, hanging in the right-hand opening
  pc.fillEllipse(a + 12.5, b - 70, 2.5, 3, '#3d3a33');
  pc.rect(a + 10, b - 68, 6, 1, '#4a463d');
  // ragged collapsed top, lower on the right
  for (let x = 0; x < spec.width; x++) {
    const cut = Math.round(Math.abs(Math.sin(x * 0.55)) * 7 + Math.max(0, x - a - 4) * 0.9 + rng() * 2);
    pc.ctx.clearRect(x, 0, 1, b - h - 26 + cut);
  }
  // buttress edges
  pc.line(a - 27, b - 13, a - 27, b - 70, C.gothicDeep);
  pc.line(a, b, a, b - h + 8, '#5a5a64');
  rubbleMound(pc, a + 18, b + 2, 10, 4, 6, 162);
  pc.rimLight('#636370');
  shadow(pc, a, b + 4, 30, 12);
  return finish(pc);
}

/** Crenellations (merlons) along the front (+y) top edge of a box. */
function merlons(pc: PixelCanvas, cx: number, cy: number, fx: number, fy: number, h: number, rng: () => number, broken = 0): void {
  const n = Math.round(fx * 3);
  for (let i = 0; i < n; i++) {
    if (rng() < broken) continue;
    const t = -fx / 2 + (i + 0.5) * (fx / n);
    for (const side of [fy / 2 - 0.1, -fy / 2 + 0.1]) {
      const [ox, oy] = iso(t, side);
      isoBox(pc, Math.round(cx + ox), Math.round(cy + oy - h), 0.16, 0.16, 4, { top: () => '#55555d', left: () => '#45454c', right: () => '#34343b' });
    }
  }
}

function drawCityWall(broken: boolean): HTMLCanvasElement {
  const { pc, spec } = canvasFor(broken ? 'city_wall_broken' : 'city_wall');
  const rng = createRng(broken ? 172 : 171);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const h = broken ? 30 : 40;
  isoBox(pc, a, b, 3, 1.25, h, { top: noisy(C.stoneDeep, rng), left: masonry('#45454c', rng, 4, 7), right: masonry('#36363d', rng, 4, 7) });
  if (broken) {
    for (let x = 0; x < spec.width; x++) {
      const cut = Math.round(Math.max(0, Math.sin(x * 0.11 + 0.6)) * 18 + rng() * 3);
      if (cut > 4) pc.ctx.clearRect(x, 0, 1, b - h - 20 + cut);
    }
    rubbleMound(pc, a + 4, b + 6, 16, 5, 6, 173);
  } else {
    merlons(pc, a, b, 3, 1.25, h, rng, 0.15);
  }
  pc.rimLight('#5c5c66');
  shadow(pc, a, b + 4, 38, 14, 0.3);
  return finish(pc);
}

function drawCityTower(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('city_tower');
  const rng = createRng(181);
  const a = spec.anchorX;
  const b = spec.anchorY;
  const h = 60;
  isoBox(pc, a, b, 1.8, 1.8, h, { top: noisy(C.stoneDeep, rng), left: masonry('#47474e', rng, 4, 6), right: masonry('#37373e', rng, 4, 6) });
  merlons(pc, a, b, 1.8, 1.8, h, rng, 0.3);
  pc.rect(a - 12, b - 40, 1, 7, C.void);
  pc.rect(a + 11, b - 36, 1, 7, C.void);
  pc.rimLight('#5c5c66');
  shadow(pc, a, b + 3, 26, 10, 0.3);
  return finish(pc);
}

function drawCityGate(): HTMLCanvasElement {
  const { pc, spec } = canvasFor('city_gate');
  const rng = createRng(191);
  const a = spec.anchorX;
  const b = spec.anchorY;
  // gate block between the towers, with the closed wooden doors on its front face
  const doorFace = (x: number, v: number): string | null => {
    const local = x - (a - 16);
    const top = 30 + Math.round(Math.sqrt(Math.max(0, 196 - (local - 14) ** 2)) * 0.6);
    if (local >= 2 && local <= 26 && v >= 1 && v < top) {
      if (v >= top - 2 || local <= 3 || local >= 25) return '#5a5a63'; // arch voussoirs
      if (v % 9 === 4) return '#1d1d22'; // iron bands
      if (Math.abs(local - 14) < 1) return '#120f0e'; // meeting doors
      return (local % 3 === 0 ? '#2a201b' : '#3a2c24');
    }
    return null;
  };
  const tower = (dx: number): void => {
    const [ox, oy] = iso(dx, 0);
    isoBox(pc, a + ox, b + oy - 2, 1.9, 2.4, 74, { top: noisy(C.stoneDeep, rng), left: masonry('#47474e', rng, 4, 6), right: masonry('#37373e', rng, 4, 6) });
    merlons(pc, a + ox, b + oy - 2, 1.9, 2.4, 74, rng, 0.35);
  };
  tower(-2); // farther tower first (painter's order along +x)
  isoBox(pc, a, b, 2.2, 1.7, 52, {
    top: noisy(C.stoneDeep, rng),
    left: (x, v) => doorFace(x, v) ?? masonry('#45454c', rng, 4, 7)(x, v),
    right: masonry('#36363d', rng, 4, 7),
  });
  merlons(pc, a, b, 2.2, 1.7, 52, rng, 0.2);
  tower(2);
  pc.rimLight('#5c5c66');
  shadow(pc, a, b + 6, 70, 24, 0.3);
  return finish(pc);
}

const DRAW: Record<RuinObjectId, () => HTMLCanvasElement> = {
  barrel: drawBarrel,
  barrels: drawBarrels,
  crate: drawCrate,
  crate_stack: drawCrateStack,
  rubble_heap: drawRubbleHeap,
  beam_pile: drawBeamPile,
  statue_broken: drawStatueBroken,
  tombstone: drawTombstone,
  fence_x: () => drawFence(false),
  fence_y: () => drawFence(true),
  table_broken: drawTableBroken,
  stairs_ruin: drawStairsRuin,
  gate_tower: drawGateTower,
  cart_broken: drawCartBroken,
  fallen_column: drawFallenColumn,
  altar: drawAltar,
  rubble_mound: drawRubbleMound,
  monument: drawMonument,
  bell_tower: drawBellTower,
  city_gate: drawCityGate,
  city_wall: () => drawCityWall(false),
  city_wall_broken: () => drawCityWall(true),
  city_tower: drawCityTower,
};

/** Registers every ruin prop texture under its TextureKeys key (skipped when real art exists). */
export function createRuinTextures(textures: Phaser.Textures.TextureManager): void {
  for (const id of Object.keys(DRAW) as RuinObjectId[]) {
    const key = TextureKeys.objects[id];
    if (!textures.exists(key)) textures.addCanvas(key, DRAW[id]());
  }
}

// ---------------------------------------------------------------------------------------------
// Flat ground details (decor)
// ---------------------------------------------------------------------------------------------

export interface DecorArt {
  key: string;
  originX: number;
  originY: number;
  /** May be mirrored for variety. */
  flippable: boolean;
}

const DECOR_SIZE: Record<DecorTextureId, [number, number]> = {
  moss: [16, 8],
  weeds: [14, 10],
  pebbles: [14, 7],
  debris: [18, 9],
  tile_shards: [14, 7],
  crack: [24, 12],
  steps: [40, 22],
};

/** Lazily creates and returns a decor texture. */
export function getDecorArt(textures: Phaser.Textures.TextureManager, type: DecorTextureId): DecorArt {
  const key = TextureKeys.decor[type];
  const [w, h] = DECOR_SIZE[type];
  if (!textures.exists(key)) textures.addCanvas(key, drawDecor(type, w, h));
  // weeds stand on their base; everything else is centred on its point
  return { key, originX: 0.5, originY: type === 'weeds' ? 0.85 : 0.5, flippable: type !== 'steps' };
}

function drawDecor(type: DecorTextureId, w: number, h: number): HTMLCanvasElement {
  const pc = new PixelCanvas(w, h);
  const rng = createRng(1000 + w * 7 + h + type.length * 13);
  const cx = w / 2;
  const cy = h / 2;
  switch (type) {
    case 'moss':
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2));
          if (1.05 - d > bayerThreshold(x, y) * 0.9 + rng() * 0.2) pc.pixel(x, y, rng() < 0.3 ? C.mossLight : C.moss);
        }
      }
      break;
    case 'weeds':
      for (let i = 0; i < 9; i++) {
        const x = 2 + Math.floor(rng() * (w - 4));
        const len = 3 + Math.floor(rng() * 5);
        const lean = rng() < 0.5 ? -1 : 1;
        pc.line(x, h - 2, x + lean * Math.floor(len / 3), h - 2 - len, rng() < 0.5 ? '#3c3a30' : '#4a4636');
      }
      pc.rect(3, h - 2, w - 6, 1, '#2a2924');
      break;
    case 'pebbles':
      for (let i = 0; i < 6; i++) {
        const x = 1 + Math.floor(rng() * (w - 3));
        const y = 1 + Math.floor(rng() * (h - 3));
        pc.rect(x, y, 2, 1, i % 2 ? C.stone : '#44444b');
        pc.pixel(x, y + 1, C.stoneDeep);
      }
      break;
    case 'debris':
      pc.line(2, 3, 10, 7, C.beam, 1);
      pc.line(3, 2, 11, 6, C.woodDark);
      pc.line(9, 2, 15, 5, C.charred);
      for (let i = 0; i < 4; i++) pc.rect(4 + Math.floor(rng() * 10), 4 + Math.floor(rng() * 3), 2, 1, C.stoneDark);
      pc.pixel(13, 7, C.rust);
      break;
    case 'tile_shards':
      // broken roof tiles: the sparing dried-red accent
      for (let i = 0; i < 5; i++) {
        const x = 1 + Math.floor(rng() * (w - 4));
        const y = 1 + Math.floor(rng() * (h - 3));
        pc.rect(x, y, 3, 1, i % 2 ? C.rust : '#3f2d2e');
        pc.pixel(x + 1, y + 1, '#251c1d');
      }
      break;
    case 'crack': {
      let x = 1;
      let y = 2;
      while (x < w - 1) {
        pc.pixel(x, y, '#121214');
        if (rng() < 0.3) pc.pixel(x, y + 1, '#18181b');
        x += 1;
        if (rng() < 0.5) y = Math.max(1, Math.min(h - 2, y + 1));
        if (rng() < 0.15 && x < w - 6) {
          // branch
          pc.line(x, y, x + 3, y - 2, '#18181b');
        }
      }
      break;
    }
    case 'steps':
      // worn, cracked chapel stair: two shallow steps rising towards -y
      for (let s = 0; s < 2; s++) {
        const oy = 8 - s * 4;
        fillPoly(
          pc,
          [
            [cx - 16 + s * 4, cy + 2 + oy - 8],
            [cx + 4 + s * 4, cy - 8 + oy - 8],
            [cx + 16 - s * 4, cy - 2 + oy - 8],
            [cx - 4 - s * 4, cy + 8 + oy - 8],
          ],
          (x, y) => ((x + y * 2) % 9 === 0 ? C.stoneDeep : rng() < 0.08 ? C.moss : s ? '#55555d' : '#4c4c54'),
        );
        pc.line(cx - 16 + s * 4, cy + 3 + oy - 8, cx - 4 - s * 4, cy + 9 + oy - 8, C.stoneDeep);
      }
      pc.line(cx - 6, cy - 2, cx + 3, cy + 3, '#121214');
      break;
  }
  return pc.upscale(MOCKUP_PIXEL_SCALE);
}
