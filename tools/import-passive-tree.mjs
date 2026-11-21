// Imports the Passive Tree UI (art-source/ui/passive_tree_minimal) and the Drifter passive icon sheet
// (art-source/ui/passive_tree_icons) into game-ready textures.
//
// 1. Window chrome. The minimal layer pack is drawn on a 1780x883 reference canvas with 2-px lines and
//    flat colours - twice the game's pixel density (960x480). Only the chrome layers are used:
//      01_window_and_panels, 02_header, 06_detail_strip, 07_footer_buttons
//    The pack's placeholder tree (03_connectors, 04_node_frames, 05_selected_state: 17 nodes incl. an upper
//    branch) is NOT used - the Drifter tree draws its own 10 nodes and lines from data. Each used layer is
//    cropped to its content (origin rounded down to even pixels) and halved by point-sampling every even
//    pixel: every 2-px line holds exactly one even pixel, so it becomes one crisp 1-px line (no blur).
//
// 2. Icons. The sheet is a 1983x793 PNG (named .jpg by the exporter) with transparency: 2 rows x 5 icons,
//    painted in a pixel-art style on a ~12-px grid that drifts slightly (it is not an exact multiple).
//    Scaling it down would blur it, so each icon is re-sampled to its native pixel grid instead:
//      - icon pixels = alpha >= 128 (drops the faint haze around the art); detached accents (red marks)
//        belong to the icon whose cell holds them;
//      - the grid pitch and phase are measured per icon and per axis (best fit of colour edges);
//      - each grid cell becomes one pixel: transparent unless most of its centre is opaque, colour = the
//        dominant colour of its centre (mode of 4-bit quantised colours, averaged within that bin).
//    Output: one horizontal strip of equal frames (each icon centred), loaded as a spritesheet and drawn
//    at integer scale with nearest-neighbour filtering.
//
// Output:
//   public/assets/ui/passive_tree/<layer>.png
//   public/assets/ui/passive_tree/drifter_passive_icons.png
//   src/ui/passiveTree/passiveTreeArt.generated.json
// Usage: node tools/import-passive-tree.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACK = path.join(ROOT, 'art-source/ui/passive_tree_minimal');
const ICON_SHEET = path.join(ROOT, 'art-source/ui/passive_tree_icons/drifter_skill_icon_sheet.png');
const OUT_DIR = path.join(ROOT, 'public/assets/ui/passive_tree');
const OUT_JSON = path.join(ROOT, 'src/ui/passiveTree/passiveTreeArt.generated.json');

const CHROME_LAYERS = ['01_window_and_panels', '02_header', '06_detail_strip', '07_footer_buttons'];
/** Sheet order, row-major (2 rows x 5). */
const ICON_IDS = ['crossed_swords', 'sword', 'crosshair', 'impact', 'shield', 'heart', 'medical_cross', 'feather', 'eye', 'star'];
const ICON_COLUMNS = 5;
const ICON_ROWS = 2;

// ---------------------------------------------------------------------------------------------- PNG io

function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);
  let pos = 8, w = 0, h = 0, ct = 0, bd = 0, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    pos += 12 + len;
  }
  if (bd !== 8) throw new Error(`${file}: bit depth ${bd} not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * bpp;
  const data = new Uint8Array(w * h * 4);
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
      if (ct === 6) data.set(line.subarray(x * 4, x * 4 + 4), o);
      else if (ct === 2) { data.set(line.subarray(x * 3, x * 3 + 3), o); data[o + 3] = 255; }
      else if (ct === 4) { data[o] = data[o + 1] = data[o + 2] = line[x * 2]; data[o + 3] = line[x * 2 + 1]; }
      else if (ct === 0) { data[o] = data[o + 1] = data[o + 2] = line[x]; data[o + 3] = 255; }
      else { const i = line[x]; data[o] = plte[i * 3]; data[o + 1] = plte[i * 3 + 1]; data[o + 2] = plte[i * 3 + 2]; data[o + 3] = trns && i < trns.length ? trns[i] : 255; }
    }
    prev = line;
  }
  return { width: w, height: h, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0); ihdr.writeUInt32BE(img.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * Halving 3-px lines leaves three kinds of 1-px leftovers at rectangle corners (P = a line pixel):
 *   A. overshoot - P is a line end one pixel past the perpendicular line it ends on: P has one line
 *      neighbour N, the line continues behind N, and N has a perpendicular line neighbour;
 *   B. inner-corner pixel - P has two line neighbours forming an L whose arms do not continue past them,
 *      and the pixel between the arms (the real corner) is a line pixel;
 *   C. side spur - P has one line neighbour N that lies on a straight run across P's direction.
 * Real line ends and the diagonal steps of an octagon match none of these. Repeated until stable; a
 * removed pixel takes the colour of a non-line neighbour (panel fill) or becomes transparent.
 */
function cleanCorners(img) {
  const { width: w, height: h, data } = img;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const isLine = (x, y) => inside(x, y) && data[(y * w + x) * 4 + 3] > 0 && data[(y * w + x) * 4] > 150;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let pass = 0; pass < 6; pass++) {
    const remove = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!isLine(x, y)) continue;
      const nb = DIRS.filter(([dx, dy]) => isLine(x + dx, y + dy));
      if (nb.length === 1) {
        const [dx, dy] = nb[0];
        const nx = x + dx, ny = y + dy;
        const continues = isLine(nx + dx, ny + dy);
        const perpA = isLine(nx + dy, ny + dx), perpB = isLine(nx - dy, ny - dx);
        if ((continues && (perpA || perpB)) || (perpA && perpB)) remove.push([x, y]); // A / C
      } else if (nb.length === 2) {
        const hz = nb.find(([dx]) => dx !== 0), vt = nb.find(([, dy]) => dy !== 0);
        if (!hz || !vt) continue;
        const armsEnd = !isLine(x + 2 * hz[0], y) && !isLine(x, y + 2 * vt[1]);
        if (armsEnd && isLine(x + hz[0], y + vt[1])) remove.push([x, y]); // B
      }
    }
    if (remove.length === 0) break;
    for (const [x, y] of remove) {
      const o = (y * w + x) * 4;
      let fill = null;
      for (const [dx, dy] of [...DIRS, [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const fx = x + dx, fy = y + dy;
        if (inside(fx, fy) && !isLine(fx, fy) && data[(fy * w + fx) * 4 + 3] > 0) { fill = data.slice((fy * w + fx) * 4, (fy * w + fx) * 4 + 4); break; }
      }
      if (fill) data.set(fill, o);
      else data.fill(0, o, o + 4);
    }
  }
}

// ------------------------------------------------------------------------------------- 1. chrome layers

const positions = JSON.parse(fs.readFileSync(path.join(PACK, 'node_positions.json'), 'utf8').replace(/^﻿/, ''));
const REF_W = positions.reference_resolution.width;
const REF_H = positions.reference_resolution.height;
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

const layers = [];
for (const id of CHROME_LAYERS) {
  const src = readPng(path.join(PACK, 'layers', `${id}.png`));
  if (src.width !== REF_W || src.height !== REF_H) throw new Error(`${id} is ${src.width}x${src.height}, expected ${REF_W}x${REF_H}`);
  let minX = REF_W, minY = REF_H, maxX = -1, maxY = -1;
  for (let y = 0; y < REF_H; y++) for (let x = 0; x < REF_W; x++) if (src.data[(y * REF_W + x) * 4 + 3] > 0) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error(`${id} is empty`);
  const cx = minX - (minX % 2), cy = minY - (minY % 2);
  const w = Math.floor((maxX - cx) / 2) + 1, h = Math.floor((maxY - cy) / 2) + 1;
  const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  const at = (x, y) => (x < 0 || y < 0 || x >= REF_W || y >= REF_H ? null : src.data.subarray((y * REF_W + x) * 4, (y * REF_W + x) * 4 + 4));
  const same = (a, b) => a && b && a[3] > 0 && b[3] > 0 && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = cx + 2 * i, sy = cy + 2 * j;
    const p = at(sx, sy);
    // Most pack lines are 3 px thick. One that starts on an even pixel is sampled twice (its 1st and 3rd
    // pixel); drop the 3rd - the previous output pixel already drew that line - so every line is 1 px.
    const thirdOfLineX = same(p, at(sx - 1, sy)) && same(p, at(sx - 2, sy)) && !same(p, at(sx + 1, sy)) && !same(p, at(sx - 3, sy));
    const thirdOfLineY = same(p, at(sx, sy - 1)) && same(p, at(sx, sy - 2)) && !same(p, at(sx, sy + 1)) && !same(p, at(sx, sy - 3));
    if (thirdOfLineX || thirdOfLineY) {
      // fall back to what lies beyond the line (panel fill / transparent)
      const beyond = thirdOfLineX ? at(sx + 1, sy) : at(sx, sy + 1);
      if (beyond) out.data.set(beyond, (j * w + i) * 4);
      continue;
    }
    out.data.set(p, (j * w + i) * 4);
  }
  cleanCorners(out);
  writePng(path.join(OUT_DIR, `${id}.png`), out);
  layers.push({ id, url: `assets/ui/passive_tree/${id}.png`, x: cx / 2, y: cy / 2, width: w, height: h });
  console.log(`${id}: ref ${cx},${cy} -> ${w}x${h} at ${cx / 2},${cy / 2}`);
}

// ------------------------------------------------------------------------------------------- 2. icons

const sheet = readPng(ICON_SHEET);
const SW = sheet.width, SH = sheet.height;
const opaque = (x, y) => sheet.data[(y * SW + x) * 4 + 3] >= 128;

// Connected components of icon pixels, assigned to the 5 x 2 cell their centre falls in.
const seen = new Uint8Array(SW * SH);
const boxes = ICON_IDS.map(() => ({ minX: SW, minY: SH, maxX: -1, maxY: -1, pixels: 0 }));
const cellW = SW / ICON_COLUMNS, cellH = SH / ICON_ROWS;
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  const start = y * SW + x;
  if (seen[start] || !opaque(x, y)) continue;
  const comp = { minX: x, minY: y, maxX: x, maxY: y, n: 0 };
  const stack = [start]; seen[start] = 1;
  while (stack.length) {
    const j = stack.pop(); const jx = j % SW, jy = (j / SW) | 0; comp.n++;
    if (jx < comp.minX) comp.minX = jx; if (jx > comp.maxX) comp.maxX = jx; if (jy < comp.minY) comp.minY = jy; if (jy > comp.maxY) comp.maxY = jy;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = jx + dx, ny = jy + dy;
      if (nx < 0 || ny < 0 || nx >= SW || ny >= SH) continue;
      const k = ny * SW + nx;
      if (!seen[k] && opaque(nx, ny)) { seen[k] = 1; stack.push(k); }
    }
  }
  if (comp.n < 20) continue; // stray specks
  const col = Math.min(ICON_COLUMNS - 1, Math.floor((comp.minX + comp.maxX) / 2 / cellW));
  const row = Math.min(ICON_ROWS - 1, Math.floor((comp.minY + comp.maxY) / 2 / cellH));
  const b = boxes[row * ICON_COLUMNS + col];
  b.minX = Math.min(b.minX, comp.minX); b.minY = Math.min(b.minY, comp.minY);
  b.maxX = Math.max(b.maxX, comp.maxX); b.maxY = Math.max(b.maxY, comp.maxY); b.pixels += comp.n;
}
boxes.forEach((b, i) => { if (b.maxX < 0) throw new Error(`icon ${ICON_IDS[i]} not found`); });

const pix = (x, y) => { const o = (y * SW + x) * 4; return sheet.data.subarray(o, o + 4); };
const diff = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]);

/** Colour-edge counts along one axis of a box (index = offset from the box edge). */
function edgeProfile(b, axis) {
  const len = axis === 'x' ? b.maxX - b.minX + 1 : b.maxY - b.minY + 1;
  const edges = new Float64Array(len + 1);
  for (let y = b.minY + 1; y <= b.maxY; y++) for (let x = b.minX + 1; x <= b.maxX; x++) {
    const p = pix(x, y);
    const q = axis === 'x' ? pix(x - 1, y) : pix(x, y - 1);
    if (p[3] < 128 && q[3] < 128) continue;
    if (diff(p, q) > 60) edges[axis === 'x' ? x - b.minX : y - b.minY]++;
  }
  return edges;
}

/** Best phase for a pitch: share of colour edges that fall on cell borders. */
function bestPhase(edges, pitch) {
  let best = { phase: 0, score: -1 };
  for (let ph10 = 0; ph10 < pitch * 10; ph10 += 2) {
    const phase = ph10 / 10;
    let hit = 0, total = 0;
    for (let i = 0; i < edges.length; i++) {
      if (!edges[i]) continue;
      total += edges[i];
      const r = (((i - phase) % pitch) + pitch) % pitch;
      if (r < 1 || r > pitch - 1) hit += edges[i];
    }
    const score = hit / total;
    if (score > best.score) best = { phase, score };
  }
  return best;
}

/**
 * Grid of one icon: ONE pitch for both axes (the painted pixels are square), a phase per axis. The
 * score favours pitches whose borders catch the most colour edges (minus the chance level 2/pitch).
 */
function fitGrid(b) {
  const ex = edgeProfile(b, 'x'), ey = edgeProfile(b, 'y');
  let best = null;
  for (let p10 = 105; p10 <= 140; p10++) {
    const pitch = p10 / 10;
    const fx = bestPhase(ex, pitch), fy = bestPhase(ey, pitch);
    const score = fx.score + fy.score - 4 / pitch;
    if (!best || score > best.score) best = { pitch, score, x: { pitch, phase: fx.phase }, y: { pitch, phase: fy.phase } };
  }
  return best;
}

/** One output pixel per grid cell: majority alpha, dominant colour of the cell centre. */
function resample(b) {
  const g = fitGrid(b);
  const gx = g.x, gy = g.y;
  // Cell borders covering the box: start at the first border at or before the box edge.
  const startX = b.minX + gx.phase - gx.pitch * Math.ceil(gx.phase / gx.pitch);
  const startY = b.minY + gy.phase - gy.pitch * Math.ceil(gy.phase / gy.pitch);
  const cols = Math.ceil((b.maxX + 1 - startX) / gx.pitch), rows = Math.ceil((b.maxY + 1 - startY) / gy.pitch);
  const out = { width: cols, height: rows, data: new Uint8Array(cols * rows * 4) };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = startX + c * gx.pitch, y0 = startY + r * gy.pitch;
    // central 60 % of the cell (avoids the soft borders between painted pixels)
    const ix0 = Math.max(0, Math.ceil(x0 + gx.pitch * 0.2)), ix1 = Math.min(SW - 1, Math.floor(x0 + gx.pitch * 0.8));
    const iy0 = Math.max(0, Math.ceil(y0 + gy.pitch * 0.2)), iy1 = Math.min(SH - 1, Math.floor(y0 + gy.pitch * 0.8));
    let opaqueCount = 0, count = 0;
    const bins = new Map();
    for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) { count++; continue; }
      const p = pix(x, y); count++;
      if (p[3] < 128) continue;
      opaqueCount++;
      const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bin.n++; bin.r += p[0]; bin.g += p[1]; bin.b += p[2];
      bins.set(key, bin);
    }
    if (count === 0 || opaqueCount * 2 <= count) continue;
    let top = null;
    for (const bin of bins.values()) if (!top || bin.n > top.n) top = bin;
    const o = (r * cols + c) * 4;
    out.data[o] = Math.round(top.r / top.n); out.data[o + 1] = Math.round(top.g / top.n); out.data[o + 2] = Math.round(top.b / top.n); out.data[o + 3] = 255;
  }
  return { img: out, grid: { pitchX: gx.pitch, pitchY: gy.pitch } };
}

/** Trims fully transparent rows / columns. */
function trim(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let y = 0; y < h; y++) out.data.set(img.data.subarray(((minY + y) * img.width + minX) * 4, ((minY + y) * img.width + minX + w) * 4), y * w * 4);
  return out;
}

const icons = boxes.map((b, i) => {
  const { img, grid } = resample(b);
  const t = trim(img);
  console.log(`${ICON_IDS[i]}: source ${b.minX},${b.minY} ${b.maxX - b.minX + 1}x${b.maxY - b.minY + 1}, grid ${grid.pitchX}x${grid.pitchY} -> ${t.width}x${t.height}`);
  return { id: ICON_IDS[i], img: t, source: { x: b.minX, y: b.minY, width: b.maxX - b.minX + 1, height: b.maxY - b.minY + 1 }, grid };
});
const frame = Math.max(...icons.map((ic) => Math.max(ic.img.width, ic.img.height)));
const strip = { width: frame * icons.length, height: frame, data: new Uint8Array(frame * icons.length * frame * 4) };
icons.forEach((ic, i) => {
  const ox = i * frame + Math.floor((frame - ic.img.width) / 2), oy = Math.floor((frame - ic.img.height) / 2);
  for (let y = 0; y < ic.img.height; y++) strip.data.set(ic.img.data.subarray(y * ic.img.width * 4, (y + 1) * ic.img.width * 4), ((oy + y) * strip.width + ox) * 4);
});
writePng(path.join(OUT_DIR, 'drifter_passive_icons.png'), strip);

const doc = {
  generatedBy: 'tools/import-passive-tree.mjs (do not edit by hand)',
  source: { pack: 'art-source/ui/passive_tree_minimal', icons: 'art-source/ui/passive_tree_icons/drifter_skill_icon_sheet.png' },
  scale: 0.5,
  canvas: { width: REF_W / 2, height: REF_H / 2 },
  layers,
  icons: {
    url: 'assets/ui/passive_tree/drifter_passive_icons.png',
    frameSize: frame,
    frames: icons.map((ic, i) => ({ id: ic.id, frame: i, width: ic.img.width, height: ic.img.height, source: ic.source, grid: ic.grid })),
  },
};
fs.writeFileSync(OUT_JSON, JSON.stringify(doc, null, 2) + '\n');
console.log(`icons: ${icons.length} frames of ${frame}x${frame}; wrote ${path.relative(ROOT, OUT_JSON)}`);
