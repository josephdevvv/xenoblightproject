// Imports delivered NPC sprite sheets (art-source/npcs/<id>/, as supplied) into the game:
//   public/assets/npcs/<id>/<file>.png        the sheet, byte-for-byte copy (no pixel changes)
//   src/npcs/art/<id>.generated.json          frame size, grid, used frames and the ground anchor
//
// The anchor is measured from the standing frame: the centre of the legs (bottom quarter of the body) and
// one row below the lowest pixel. It is shared by every frame, so the import refuses a sheet whose used
// frames do not all stand on the same feet row (that would make the NPC hop while animating).
// Usage: node tools/import-npc-sheets.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');

const SHEETS = {
  // city_guard_01 ("Mateus"): 256 x 256, 4 x 4 grid of 64 x 64, row-major; frames 1-13 used (14-16 empty).
  // Frame 1 = standing pose; frames 2-13 = the idle animation played once.
  city_guard_01: {
    source: 'art-source/npcs/city_guard_01/MateusIdleAnimation.png',
    file: 'MateusIdleAnimation.png',
    frameWidth: 64,
    frameHeight: 64,
    columns: 4,
    standFrame: 1,
    playFrames: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    facing: 'SW',
  },
  // city_guard_jack / city_guard_sonny (gate guards): same layout as Mateus - 4 x 4 of 64 x 64, frames 1-13.
  city_guard_jack: {
    source: 'art-source/npcs/city_guard_jack/DoorGuard01IdleAnimation.png',
    file: 'DoorGuard01IdleAnimation.png',
    frameWidth: 64,
    frameHeight: 64,
    columns: 4,
    standFrame: 1,
    playFrames: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    facing: 'SW',
  },
  city_guard_sonny: {
    source: 'art-source/npcs/city_guard_sonny/DoorGuard02IdleAnimation.png',
    file: 'DoorGuard02IdleAnimation.png',
    frameWidth: 64,
    frameHeight: 64,
    columns: 4,
    standFrame: 1,
    playFrames: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    facing: 'SW',
  },
};

function readAlpha(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, ct = 0, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'tRNS') trns = data;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * bpp;
  const alpha = new Uint8Array(w * h);
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
    for (let x = 0; x < w; x++) alpha[y * w + x] = ct === 6 ? line[x * 4 + 3] : ct === 4 ? line[x * 2 + 1] : ct === 3 ? (trns && line[x] < trns.length ? trns[line[x]] : 255) : 255;
    prev = line;
  }
  return { w, h, alpha };
}

for (const [id, s] of Object.entries(SHEETS)) {
  const src = path.join(ROOT, s.source);
  const img = readAlpha(src);
  const cell = (n) => ({ x: ((n - 1) % s.columns) * s.frameWidth, y: Math.floor((n - 1) / s.columns) * s.frameHeight });
  const box = (n) => {
    const c = cell(n);
    let top = s.frameHeight, bottom = -1;
    for (let y = 0; y < s.frameHeight; y++) for (let x = 0; x < s.frameWidth; x++) if (img.alpha[(c.y + y) * img.w + c.x + x] >= 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    if (bottom < 0) throw new Error(`${id}: frame ${n} is empty`);
    return { top, bottom };
  };
  const stand = box(s.standFrame);
  for (const n of s.playFrames) {
    if (box(n).bottom !== stand.bottom) throw new Error(`${id}: frame ${n} stands on row ${box(n).bottom}, frame ${s.standFrame} on ${stand.bottom}`);
  }
  const c = cell(s.standFrame);
  const legsFrom = Math.round(stand.bottom - (stand.bottom - stand.top + 1) * 0.25);
  let minX = s.frameWidth, maxX = -1;
  for (let y = legsFrom; y <= stand.bottom; y++) for (let x = 0; x < s.frameWidth; x++) if (img.alpha[(c.y + y) * img.w + c.x + x] >= 128) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  const anchor = { x: Math.round((minX + maxX) / 2), y: stand.bottom + 1, top: stand.top };

  const outDir = path.join(ROOT, 'public/assets/npcs', id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(src, path.join(outDir, s.file));
  // Phaser numbers spritesheet frames from 0, row-major: frame n here = index n - 1
  const meta = {
    id,
    file: s.file,
    frameWidth: s.frameWidth,
    frameHeight: s.frameHeight,
    columns: s.columns,
    standFrame: s.standFrame - 1,
    playFrames: s.playFrames.map((n) => n - 1),
    facing: s.facing,
    anchor,
  };
  const json = path.join(ROOT, 'src/npcs/art', `${id}.generated.json`);
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, JSON.stringify(meta, null, 2) + '\n');
  console.log(id, 'anchor', anchor, 'frames', s.standFrame, '+', s.playFrames.join(','));
}
