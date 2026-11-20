// Assembles the Zone 5 city wall sprites from the PixelLab building kit (art-source/pixellab/city_wall_kit).
//
// The kit is a 2:1 isometric set at tile_size 32 - exactly the game's logical grid (64 x 32 world tiles are
// drawn at half resolution and upscaled x2). Each piece is one tile edge of wall, three storeys (48 px)
// high, on a 52 x 74 canvas whose floor diamond has its top corner at (26, 53).
// Solid blocks are built from the visible faces only: S pieces on the front (+row) edge, E pieces on the
// right (+col) edge, stacked to the wanted height, then a stone top and battlements.
//
// Usage: node tools/compose-city-wall.mjs
//   writes public/assets/environment/city_wall/*.png (shipped), src/world/objects/handmadeArt.generated.json,
//   and art-source/pixellab/composed/ (bases before the detail passes + anchors.json)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const KIT = path.join(ROOT, 'art-source/pixellab/city_wall_kit');
const OUT = path.join(ROOT, 'public/assets/environment/city_wall');
/** Intermediate sprites (before the detail passes) and anchors - kept with the sources, not shipped. */
const WORK = path.join(ROOT, 'art-source/pixellab/composed');
const SCALE = 2; // logical -> world pixels

// ------------------------------------------------------------------------------------------------
// PNG io (RGBA / indexed / grey), no dependencies
// ------------------------------------------------------------------------------------------------
function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = (line[i] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 6) line.copy(px, o, x * 4, x * 4 + 4);
      else if (ct === 2) { px[o] = line[x * 3]; px[o + 1] = line[x * 3 + 1]; px[o + 2] = line[x * 3 + 2]; px[o + 3] = 255; }
      else if (ct === 3) { const k = line[x]; px[o] = plte[k * 3]; px[o + 1] = plte[k * 3 + 1]; px[o + 2] = plte[k * 3 + 2]; px[o + 3] = trns && k < trns.length ? trns[k] : 255; }
      else if (ct === 4) { px[o] = px[o + 1] = px[o + 2] = line[x * 2]; px[o + 3] = line[x * 2 + 1]; }
      else { px[o] = px[o + 1] = px[o + 2] = line[x]; px[o + 3] = 255; }
    }
    prev = line;
  }
  return { w, h, px };
}

const crcT = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let r = 0xffffffff; for (const x of b) r = crcT[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
function writePng(file, { w, h, px }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// ------------------------------------------------------------------------------------------------
// Drawing on a logical canvas
// ------------------------------------------------------------------------------------------------
const piece = Object.fromEntries([0, 1, 2, 3, 4, 31, 44, 53].map((i) => [i, readPng(path.join(KIT, `tile_${i}.png`))]));
const KIT_TOP = { x: 26, y: 53 }; // floor diamond top corner inside every kit canvas
const STOREYS = 48; // one kit wall piece is this tall

function canvas(w, h) { return { w, h, px: Buffer.alloc(w * h * 4) }; }
function hex(c) { const v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function set(img, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const [r, g, b] = hex(c); const o = (y * img.w + x) * 4;
  img.px[o] = r; img.px[o + 1] = g; img.px[o + 2] = b; img.px[o + 3] = 255;
}
function clear(img, x, y) { if (x >= 0 && y >= 0 && x < img.w && y < img.h) img.px.fill(0, (y * img.w + x) * 4, (y * img.w + x) * 4 + 4); }
/** Copies opaque pixels; `trimBase` drops that many px above each column's bottom (no repeated moss band). */
function blit(dst, src, ox, oy, trimBase = 0) {
  const bottom = [];
  for (let x = 0; x < src.w; x++) { let b = -1; for (let y = src.h - 1; y >= 0; y--) if (src.px[(y * src.w + x) * 4 + 3] >= 128) { b = y; break; } bottom.push(b); }
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const s = (y * src.w + x) * 4; if (src.px[s + 3] < 128) continue;
    if (trimBase && y > bottom[x] - trimBase) continue;
    const dx = x + ox, dy = y + oy; if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    src.px.copy(dst.px, (dy * dst.w + dx) * 4, s, s + 3); dst.px[(dy * dst.w + dx) * 4 + 3] = 255;
  }
}

// Logical iso: top corner of cell (c, r) relative to the sprite origin O.
const cellTop = (O, c, r) => ({ x: O.x + (c - r) * 16, y: O.y + (c + r) * 8 });

/**
 * A solid block on cells [c0, c0+w) x [r0, r0+h), `height` px tall (>= 48; stacked in 24 px steps).
 * Faces: S on the front row, E on the right column (only those face the camera).
 */
function block(img, O, c0, r0, w, h, height, { east = true, south = true } = {}) {
  const lifts = [];
  for (let lift = 0; lift + STOREYS <= height; lift += 24) lifts.push(lift);
  if (lifts[lifts.length - 1] + STOREYS < height) lifts.push(height - STOREYS);
  const faces = [];
  for (let c = c0; c < c0 + w; c++) if (south) faces.push({ c, r: r0 + h - 1, id: 3 });
  for (let r = r0; r < r0 + h; r++) if (east) faces.push({ c: c0 + w - 1, r, id: 2 });
  faces.sort((a, b) => a.c + a.r - (b.c + b.r));
  for (const lift of lifts) {
    for (const f of faces) {
      const t = cellTop(O, f.c, f.r);
      // upper stacked copies only add their top part, so the moss-stained base is not repeated
      blit(img, piece[f.id], t.x - KIT_TOP.x, t.y - KIT_TOP.y - lift, lift === 0 ? 0 : 14);
    }
  }
  // stone top (roof) at the block's height
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
    const t = cellTop(O, c, r);
    blit(img, piece[44], t.x - KIT_TOP.x, t.y - KIT_TOP.y - height);
  }
  return { top: height };
}

/** Battlements: merlons along the front (+row) and right (+col) top edges; `skip` drops some for ruin. */
function battlements(img, O, c0, r0, w, h, height, rnd, skip = 0) {
  const merlon = (x, y) => {
    // 5 x 8 stone block: lit top, mid face, dark right side, outlined
    for (let dy = 0; dy < 8; dy++) for (let dx = 0; dx < 5; dx++) {
      let col = dy === 0 ? '#6c6c75' : dx >= 4 ? '#2b2b30' : dx === 0 ? '#55555e' : '#45454d';
      if (dy === 4 && dx < 4) col = '#34343a';
      set(img, x + dx, y - 8 + dy, col);
    }
    for (let dy = 0; dy < 8; dy++) set(img, x + 5, y - 8 + dy, '#18161a');
    for (let dx = 0; dx < 5; dx++) set(img, x + dx, y - 9, '#18161a');
  };
  const along = [];
  for (let c = c0; c < c0 + w; c++) for (const f of [0.25, 0.75]) along.push({ cx: c + f, cy: r0 + h });
  for (let r = r0; r < r0 + h; r++) for (const f of [0.25, 0.75]) along.push({ cx: c0 + w, cy: r + f });
  along.sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  for (const p of along) {
    if (rnd() < skip) continue;
    const x = O.x + (p.cx - p.cy) * 16, y = O.y + (p.cx + p.cy) * 8 - height;
    merlon(Math.round(x) - 2, Math.round(y));
  }
}

/** Carves a ragged breach into the block from the top down, leaving a few loose stones at its foot. */
function breach(img, xFrom, xTo, depth, rnd) {
  for (let x = xFrom; x <= xTo; x++) {
    let top = -1;
    for (let y = 0; y < img.h; y++) if (img.px[(y * img.w + x) * 4 + 3]) { top = y; break; }
    if (top < 0) continue;
    const t = (x - xFrom) / (xTo - xFrom);
    // ragged V: steep sides, stepped in block-sized (3 px) columns like fallen courses of masonry
    const step = Math.floor((x - xFrom) / 3);
    const v = 1 - Math.pow(Math.abs(2 * t - 1), 0.8);
    const jag = ((step * 7919) % 11) / 11 - 0.5;
    const d = Math.max(0, Math.round(v * depth + jag * 9 + (rnd() - 0.5) * 2));
    for (let y = 0; y < top + d; y++) clear(img, x, y);
    // broken stone edge on the new top
    if (d > 0) { set(img, x, top + d, rnd() < 0.5 ? '#585862' : '#4a4a52'); set(img, x, top + d + 1, '#34343a'); }
  }
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Crops to the opaque area and returns the sprite + where the footprint centre ground point is. */
function finish(img, O, w, h, name, extra = {}) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[(y * img.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cw = x1 - x0 + 1, ch = Math.max(y1 - y0 + 1, 1);
  // footprint centre ground point
  const cx = O.x + (w / 2 - h / 2) * 16, cy = O.y + (w / 2 + h / 2) * 8;
  const out = canvas(cw * SCALE, ch * SCALE);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = ((y0 + Math.floor(y / SCALE)) * img.w + x0 + Math.floor(x / SCALE)) * 4;
    img.px.copy(out.px, (y * out.w + x) * 4, s, s + 4);
  }
  writePng(path.join(name.endsWith('_base') ? WORK : OUT, `${name}.png`), out);
  return { width: out.w, height: out.h, anchorX: (cx - x0) * SCALE, anchorY: (cy - y0) * SCALE, ...extra };
}

// ------------------------------------------------------------------------------------------------
// Sprites
// ------------------------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const anchors = {};

function wallSegment(name, broken, seed) {
  const img = canvas(200, 200);
  const O = { x: 70, y: 110 };
  const rnd = mulberry(seed);
  block(img, O, 0, 0, 3, 2, 48);
  battlements(img, O, 0, 0, 3, 2, 48, rnd, broken ? 0.55 : 0.12);
  if (broken) {
    // a breach in the middle of the segment
    const mid = cellTop(O, 1.5, 2);
    breach(img, Math.round(mid.x - 26), Math.round(mid.x + 14), 30, rnd);
  }
  anchors[name] = finish(img, O, 3, 2, name);
}

function tower(name, seed) {
  const img = canvas(200, 240);
  const O = { x: 60, y: 140 };
  const rnd = mulberry(seed);
  block(img, O, 0, 0, 2, 2, 72);
  battlements(img, O, 0, 0, 2, 2, 72, rnd, 0.25);
  anchors[name] = finish(img, O, 2, 2, name);
}

function gatehouse(name, seed) {
  const img = canvas(320, 280);
  const O = { x: 120, y: 160 };
  const rnd = mulberry(seed);
  // back to front: left tower, gate block (flush with the towers' front), right tower
  block(img, O, 0, 0, 2, 3, 96);
  battlements(img, O, 0, 0, 2, 3, 96, rnd, 0.3);
  block(img, O, 2, 0, 2, 3, 60, { east: false });
  battlements(img, O, 2, 0, 2, 3, 60, rnd, 0.2);
  block(img, O, 4, 0, 2, 3, 96);
  battlements(img, O, 4, 0, 2, 3, 96, rnd, 0.35);
  // where the gate goes (front face of the gate block, line row = 3, cols 2..4): reported for the inpainting mask
  const a = cellTop(O, 2, 3), b = cellTop(O, 4, 3);
  anchors[name] = finish(img, O, 6, 3, name, { gateFace: { from: a, to: b } });
}

function bellTower(name, seed) {
  const img = canvas(200, 300);
  const O = { x: 60, y: 200 };
  const rnd = mulberry(seed);
  block(img, O, 0, 0, 2, 2, 120);
  battlements(img, O, 0, 0, 2, 2, 120, rnd, 0.45);
  // the top was hit hardest: a ragged break on the right
  const right = cellTop(O, 2, 1);
  breach(img, Math.round(right.x - 6), Math.round(right.x + 16), 14, rnd);
  anchors[name] = finish(img, O, 2, 2, name, { faces: { south: [cellTop(O, 0, 2), cellTop(O, 2, 2)], east: [cellTop(O, 2, 2), cellTop(O, 2, 0)] }, towerHeight: 120 });
}

wallSegment('city_wall', false, 11);
wallSegment('city_wall_broken', true, 12);
tower('city_tower', 21);
gatehouse('city_gate_base', 31);
bellTower('bell_tower_base', 41);

// ------------------------------------------------------------------------------------------------
// Detail passes at logical resolution
// ------------------------------------------------------------------------------------------------
function toLogical(img) {
  const o = canvas(img.w / SCALE, img.h / SCALE);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) img.px.copy(o.px, (y * o.w + x) * 4, (y * SCALE * img.w + x * SCALE) * 4, (y * SCALE * img.w + x * SCALE) * 4 + 4);
  return o;
}
function writeUpscaled(img, name) {
  const o = canvas(img.w * SCALE, img.h * SCALE);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) img.px.copy(o.px, (y * o.w + x) * 4, (Math.floor(y / SCALE) * img.w + Math.floor(x / SCALE)) * 4, (Math.floor(y / SCALE) * img.w + Math.floor(x / SCALE)) * 4 + 4);
  writePng(path.join(OUT, `${name}.png`), o);
}
const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.w && y < img.h && img.px[(y * img.w + x) * 4 + 3] >= 128;

// City gate: the wooden doors were painted by PixelLab (create_map_object, style-matched inpainting into
// the gatehouse front; art-source/pixellab/city_gate/gate_ctx.png + gate_mask.png are the exact context and
// mask sent, gate_inpaint.png the result at the base's logical size). The stone arch around them is drawn here.
{
  const img = toLogical(readPng(path.join(WORK, 'city_gate_base.png')));
  const door = readPng(path.join(ROOT, 'art-source/pixellab/city_gate/gate_inpaint.png'));
  if (door.w !== img.w || door.h !== img.h) throw new Error('gate inpaint does not match the gatehouse');
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!opaque(door, x, y)) continue;
    // muted towards the map palette: 25 % towards dark charred oak
    const o = (y * img.w + x) * 4, d = (y * door.w + x) * 4, tint = [0x2a, 0x25, 0x22];
    for (let k = 0; k < 3; k++) img.px[o + k] = Math.round(door.px[d + k] * 0.75 + tint[k] * 0.25);
    img.px[o + 3] = 255;
  }
  let doorTop = img.h, cx = 0, n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (opaque(door, x, y)) { doorTop = Math.min(doorTop, y); cx += x; n++; }
  cx /= n;
  // voussoirs: a 3 px ring around the sides and top of the doors, cut into blocks radiating from the centre
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (opaque(door, x, y)) continue;
    let d = 99;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (opaque(door, x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
    if (d > 3) continue;
    let under = false; for (let k = 1; k <= 3; k++) if (opaque(door, x, y - k)) under = true; // nothing below the doors
    if (under) continue;
    const ang = Math.atan2(y - (doorTop + 18), x - cx);
    const block = Math.floor((ang + Math.PI) / 0.32);
    const joint = Math.abs(((ang + Math.PI) / 0.32) % 1) < 0.16;
    const key = y <= doorTop + 1 && Math.abs(x - cx) < 2.5;
    let col = joint ? '#1b1b1f' : block % 2 ? '#585862' : '#4a4a52';
    if (key) col = '#6c6c75';
    if (d === 3) col = '#25252a'; // outer shadow line
    if (d === 1 && !joint) col = block % 2 ? '#62626b' : '#50505a'; // lit inner edge
    set(img, x, y, col);
  }
  writeUpscaled(img, 'city_gate');
}

// Bell tower: kit stone (PixelLab) with belfry openings and a bell drawn here, in the kit palette. The
// openings use the mask in art-source/pixellab/bell_tower/belfry_mask.png. (A PixelLab inpaint of the belfry
// was tried and rejected: it filled the openings with more wall - see art-source/pixellab/README.md.)
{
  const img = toLogical(readPng(path.join(WORK, 'bell_tower_base.png')));
  const mask = readPng(path.join(ROOT, 'art-source/pixellab/bell_tower/belfry_mask.png'));
  const inside = (x, y) => x >= 0 && y >= 0 && x < mask.w && y < mask.h && mask.px[(y * mask.w + x) * 4] > 127;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!inside(x, y)) continue;
    const edgeL = !inside(x - 1, y), edgeR = !inside(x + 1, y), edgeT = !inside(x, y - 1);
    let col = '#0b0b0d';
    if (edgeT) col = '#62626b'; else if (edgeL) col = '#55555e'; else if (edgeR) col = '#2b2b30';
    else if (!inside(x - 2, y) || !inside(x, y - 2)) col = '#121215'; // inner reveal shadow
    set(img, x, y, col);
  }
  // the bell, hanging in the second opening of the front face
  let bx = 0, by = 1e9, cnt = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w / 2; x++) if (inside(x, y) && x > img.w * 0.22) { bx += x; by = Math.min(by, y); cnt++; }
  bx = Math.round(bx / cnt); by += 4;
  const bell = ['  #3d3423#3d3423  ', ' #4a3f2a#5a4a2e#4a3f2a ', '#4a3f2a#6a5633#7a6438#5a4a2e', '#3d3423#5a4a2e#6a5633#4a3f2a#3d3423'];
  set(img, bx, by - 2, '#2a2522'); set(img, bx, by - 1, '#2a2522');
  const shape = [[0, 0, 1], [-1, 1, 3], [-2, 2, 5], [-2, 3, 5], [-3, 4, 7]];
  for (const [x0, dy, w] of shape) for (let i = 0; i < w; i++) set(img, bx + x0 + i, by + dy, i === 0 ? '#7a6438' : i === w - 1 ? '#3d3423' : i < w / 2 ? '#6a5633' : '#5a4a2e');
  void bell;
  writeUpscaled(img, 'bell_tower');
}
fs.writeFileSync(path.join(WORK, 'anchors.json'), JSON.stringify(anchors, null, 2));
// Game-facing registry (object id -> file + footprint-centre anchor in world px). The gate sprite is the
// base plus the PixelLab-painted gate (tools: see art-source/pixellab/README.md), same size and anchor.
const registry = {
  city_wall: { file: 'city_wall.png', ...pick(anchors.city_wall) },
  city_wall_broken: { file: 'city_wall_broken.png', ...pick(anchors.city_wall_broken) },
  city_tower: { file: 'city_tower.png', ...pick(anchors.city_tower) },
  city_gate: { file: 'city_gate.png', ...pick(anchors.city_gate_base) },
  bell_tower: { file: 'bell_tower.png', ...pick(anchors.bell_tower_base) },
};
function pick(a) { return { width: a.width, height: a.height, anchorX: a.anchorX, anchorY: a.anchorY }; }
fs.writeFileSync(path.join(ROOT, 'src/world/objects/handmadeArt.generated.json'), JSON.stringify(registry, null, 2) + String.fromCharCode(10));
console.log(anchors);
