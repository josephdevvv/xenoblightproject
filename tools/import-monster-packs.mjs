// Imports the delivered monster packs (art-source/monsters/<id>/, exactly as supplied: per-direction
// horizontal sheets + README + manifest) into game-ready files:
//
//   public/assets/monsters/<id>/<action>.png      one sheet per action: rows SE, SW, NE, NW; columns = frames
//   src/monsters/art/<id>.generated.json          frame sizes / counts, ground anchors, VFX offsets, QA data
//
// Pixels are copied unchanged (no scaling, no recolouring, alpha kept as delivered). Everything measured
// here (feet rows, anchors, mouth position for the bite VFX, stray pixels) comes from the art itself.
//
// Usage: node tools/import-monster-packs.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIRS = [
  ['SE', 'south_east'],
  ['SW', 'south_west'],
  ['NE', 'north_east'],
  ['NW', 'north_west'],
];

/** Pack folder per game action, and which action's frame the VFX plays from (see src/monsters/art). */
const PACKS = {
  void_mite: {
    source: 'art-source/monsters/void_mite',
    actions: { idle: 'Idle', walk: 'Walk', attack: 'Attack_Stomp', hit: 'Hit_Reaction', death: 'Death_Fall' },
    frames: { idle: 1, walk: 6, attack: 6, hit: 4, death: 6, vfx: 3 },
    vfx: { folder: 'VFX_Stomp_Impact', placement: 'cell' }, // same 48x32 cell as the body: overlay as is
    // The delivered Death_Fall art is drawn ~1.43x larger than every other action: scale it back to the
    // idle body size (nearest neighbour, about the ground anchor, alpha copied unchanged).
    matchIdleScale: ['death'],
  },
  mutant_wolf: {
    source: 'art-source/monsters/mutant_wolf',
    actions: { idle: 'Idle', walk: 'Walk_Light_Run', attack: 'Attack_Pounce_Bite', hit: 'Hit_Reaction', death: 'Death_Prone' },
    frames: { idle: 1, walk: 6, attack: 6, hit: 4, death: 5, vfx: 3 },
    vfx: { folder: 'VFX_Bite_Impact', placement: 'mouth', contactFrame: 5 }, // 32x32 burst centred on the jaws
  },
};

// ------------------------------------------------------------------------------------------------
// PNG io
// ------------------------------------------------------------------------------------------------
function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8) throw new Error(`${file}: only 8-bit PNGs`); }
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
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// ------------------------------------------------------------------------------------------------
// Frame analysis
// ------------------------------------------------------------------------------------------------
function sheetFor(packRoot, folder, dirName) {
  const dir = path.join(packRoot, folder, dirName, 'sheet');
  const file = fs.readdirSync(dir).find((n) => n.endsWith('.png'));
  if (!file) throw new Error(`no sheet in ${dir}`);
  return readPng(path.join(dir, file));
}

const alphaAt = (img, x, y) => img.px[(y * img.w + x) * 4 + 3];

/** Bounding box, feet row, semi-transparent count and detached specks of one frame. */
function analyse(img, fx, cw, ch, fy = 0) {
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1, semi = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const a = alphaAt(img, fx + x, fy + y);
    if (a > 0 && a < 255) semi++;
    if (a >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  // connected components (8-neighbour) of all non-transparent pixels; tiny ones far from the body are specks
  const seen = new Uint8Array(cw * ch);
  const comps = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (seen[y * cw + x] || alphaAt(img, fx + x, fy + y) === 0) continue;
    const stack = [[x, y]]; seen[y * cw + x] = 1; const pts = [];
    while (stack.length) {
      const [cx, cy] = stack.pop(); pts.push([cx, cy]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || seen[ny * cw + nx] || alphaAt(img, fx + nx, fy + ny) === 0) continue;
        seen[ny * cw + nx] = 1; stack.push([nx, ny]);
      }
    }
    comps.push(pts);
  }
  comps.sort((a, b) => b.length - a.length);
  const specks = comps.slice(1).filter((c) => c.length <= 3).map((c) => c[0]);
  return { box: [x0, y0, x1, y1], feet: y1, semi, specks };
}

/**
 * Nearest-neighbour rescale of every frame about its facing's ground anchor (k < 1 shrinks). The anchor
 * pixel maps to itself, so the feet stay on the root; RGBA is copied unchanged (no blending, alpha kept).
 */
function rescaleAboutAnchors(img, cw, ch, frames, anchors, k) {
  const src = Buffer.from(img.px);
  img.px.fill(0);
  for (let row = 0; row < anchors.length; row++) {
    const a = anchors[row];
    for (let f = 0; f < frames; f++) {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const sx = Math.floor(a.x + (x + 0.5 - a.x) / k);
        const sy = Math.floor(a.y + (y + 0.5 - a.y) / k);
        if (sx < 0 || sy < 0 || sx >= cw || sy >= ch) continue;
        const s = ((row * ch + sy) * img.w + f * cw + sx) * 4;
        src.copy(img.px, ((row * ch + y) * img.w + f * cw + x) * 4, s, s + 4);
      }
    }
  }
}

/** Mouth / jaw point of a facing (extreme opaque pixel towards the facing, upper body only). */
function mouth(img, fx, cw, ch, dir, box, fy = 0) {
  const score = { SE: (x, y) => x - 0.15 * y, SW: (x, y) => -x - 0.15 * y, NE: (x, y) => x - y, NW: (x, y) => -x - y }[dir];
  let best = null, bestS = -1e9;
  const maxY = box[1] + (box[3] - box[1]) * 0.7;
  for (let y = box[1]; y <= maxY; y++) for (let x = 0; x < cw; x++) {
    if (alphaAt(img, fx + x, fy + y) < 128) continue;
    // body pixels only: at least 4 opaque neighbours (skips specks, whiskers and single-pixel tips)
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < cw && ny < ch && alphaAt(img, fx + nx, fy + ny) >= 128) n++;
    }
    if (n < 4) continue;
    const s = score(x, y);
    if (s > bestS) { bestS = s; best = { x, y }; }
  }
  return best;
}

// ------------------------------------------------------------------------------------------------
// Import
// ------------------------------------------------------------------------------------------------
for (const [id, pack] of Object.entries(PACKS)) {
  const src = path.join(ROOT, pack.source);
  const manifest = JSON.parse(fs.readFileSync(path.join(src, fs.readdirSync(src).find((n) => n.endsWith('manifest.json'))), 'utf8'));
  const meta = { id, name: manifest.name, nameTh: manifest.name_th ?? null, rows: DIRS.map(([d]) => d), actions: {}, vfx: null, qa: { specks: [], notes: [] } };

  // Body root: horizontal centre of the cell, one row below the lowest feet pixel of the idle frames.
  const idle = DIRS.map(([, name]) => sheetFor(src, pack.actions.idle, name));
  const cellW = idle[0].w / pack.frames.idle, cellH = idle[0].h;
  const idleBoxes = idle.map((img) => analyse(img, 0, cellW, cellH).box);
  const root = { x: cellW / 2, y: Math.max(...idleBoxes.map((b) => b[3])) + 1 };

  for (const [action, folder] of Object.entries(pack.actions)) {
    const sheets = DIRS.map(([, name]) => sheetFor(src, folder, name));
    const frames = pack.frames[action];
    const cw = sheets[0].w / frames, ch = sheets[0].h;
    if (!Number.isInteger(cw)) throw new Error(`${id}/${action}: sheet width ${sheets[0].w} is not ${frames} frames`);
    const out = { w: cw * frames, h: ch * 4, px: Buffer.alloc(cw * frames * ch * 4 * 4) };
    const anchors = {};
    const feet = {};
    DIRS.forEach(([dir], row) => {
      const s = sheets[row];
      if (s.w !== cw * frames || s.h !== ch) throw new Error(`${id}/${action}/${dir}: ${s.w}x${s.h}, expected ${cw * frames}x${ch}`);
      for (let y = 0; y < ch; y++) s.px.copy(out.px, ((row * ch + y) * out.w) * 4, y * s.w * 4, (y + 1) * s.w * 4);
      const info = Array.from({ length: frames }, (_, f) => analyse(s, f * cw, cw, ch));
      feet[dir] = info.map((i) => i.feet);
      for (const [f, i] of info.entries()) for (const [x, y] of i.specks) meta.qa.specks.push(`${action} ${dir} frame ${f + 1}: speck at (${x}, ${y})`);
      if (cw === cellW && ch === cellH) {
        anchors[dir] = { ...root };
      } else {
        // Different cell size: align the first frame's feet and body centre with the idle frame.
        const a = info[0].box, b = idleBoxes[row];
        anchors[dir] = { x: Math.round(root.x + (a[0] + a[2]) / 2 - (b[0] + b[2]) / 2), y: root.y + a[3] - b[3] };
        const scale = (a[3] - a[1] + 1) / (b[3] - b[1] + 1);
        if (Math.abs(scale - 1) > 0.15 && dir === 'SE') meta.qa.notes.push(`${action}: drawn at x${scale.toFixed(2)} the height of the idle frame (${a[3] - a[1] + 1} vs ${b[3] - b[1] + 1} px) - the creature visibly changes size when this action starts`);
      }
    });
    if ((pack.matchIdleScale ?? []).includes(action)) {
      // one factor for the whole action: idle body height / first-frame body height, averaged over facings
      const ratios = DIRS.map((_, row) => {
        const a = analyse(sheets[row], 0, cw, ch).box, b = idleBoxes[row];
        return (b[3] - b[1] + 1) / (a[3] - a[1] + 1);
      });
      const k = ratios.reduce((x, y) => x + y, 0) / ratios.length;
      rescaleAboutAnchors(out, cw, ch, frames, DIRS.map(([d]) => anchors[d]), k);
      meta.qa.notes.push(`${action}: rescaled x${k.toFixed(3)} (nearest neighbour, about the ground anchor) to the idle body size`);
      DIRS.forEach(([dir], row) => { feet[dir] = Array.from({ length: frames }, (_, f) => analyse(out, f * cw, cw, ch, row * ch).feet); });
    }
    const file = `${action}.png`;
    writePng(path.join(ROOT, 'public/assets/monsters', id, file), out);
    meta.actions[action] = { file, frameWidth: cw, frameHeight: ch, frames, anchors, feet };
  }

  // VFX: separate layer
  {
    const v = pack.vfx;
    const sheets = DIRS.map(([, name]) => sheetFor(src, v.folder, name));
    const frames = pack.frames.vfx;
    const cw = sheets[0].w / frames, ch = sheets[0].h;
    const out = { w: cw * frames, h: ch * 4, px: Buffer.alloc(cw * frames * ch * 4 * 4) };
    DIRS.forEach((_, row) => { const s = sheets[row]; for (let y = 0; y < ch; y++) s.px.copy(out.px, ((row * ch + y) * out.w) * 4, y * s.w * 4, (y + 1) * s.w * 4); });
    writePng(path.join(ROOT, 'public/assets/monsters', id, 'vfx_attack.png'), out);
    const offsets = {};
    const origins = {};
    if (v.placement === 'cell') {
      // drawn in the body's own cell: same origin as the body
      for (const [dir] of DIRS) { offsets[dir] = { x: 0, y: 0 }; origins[dir] = { ...root }; }
    } else {
      const attack = DIRS.map(([, name]) => sheetFor(src, pack.actions.attack, name));
      const acw = attack[0].w / pack.frames.attack, ach = attack[0].h;
      DIRS.forEach(([dir], row) => {
        const fx = (v.contactFrame - 1) * acw;
        const info = analyse(attack[row], fx, acw, ach);
        const m = mouth(attack[row], fx, acw, ach, dir, info.box);
        offsets[dir] = { x: m.x - root.x, y: m.y - root.y };
        origins[dir] = { x: cw / 2, y: ch / 2 };
      });
    }
    meta.vfx = { file: 'vfx_attack.png', frameWidth: cw, frameHeight: ch, frames, origins, offsets };
  }

  const outJson = path.join(ROOT, 'src/monsters/art', `${id}.generated.json`);
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(meta, null, 2) + '\n');
  console.log(`${id}: root ${JSON.stringify(root)}; ${Object.entries(meta.actions).map(([a, m]) => `${a} ${m.frames}x${m.frameWidth}x${m.frameHeight}`).join(', ')}; vfx ${meta.vfx.frameWidth}x${meta.vfx.frameHeight}`);
  for (const n of meta.qa.notes) console.log('  note:', n);
  if (meta.qa.specks.length) console.log(`  ${meta.qa.specks.length} detached specks (<= 3 px):`, meta.qa.specks.slice(0, 12).join('; '));
}
