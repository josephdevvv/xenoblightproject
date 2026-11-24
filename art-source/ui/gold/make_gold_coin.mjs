import fs from 'node:fs';
import zlib from 'node:zlib';
const [out32, out16, preview] = process.argv.slice(2);
const N = 32, c = 15.5;
const RAMP = { outline: [0x2a, 0x1a, 0x05], dark: [0x7a, 0x50, 0x12], mid: [0xb8, 0x86, 0x22], face: [0xd9, 0xa8, 0x34], faceHi: [0xe8, 0xbd, 0x45], light: [0xf8, 0xdc, 0x78], shine: [0xff, 0xf3, 0xb8], shadow: [0x96, 0x68, 0x18] };
// the rose relief (raised area), drawn on the 32 x 32 grid
const relief = new Set();
const add = (x, y) => relief.add(`${x},${y}`);
const head = [
  '...#####...',
  '.#########.',
  '###########',
  '###########',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
  '....###....',
];
head.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && add(10 + i, 6 + j)));
// petal spiral (cut lines inside the bloom)
const petals = [
  '...........',
  '....###....',
  '...#...#...',
  '..#..#..#..',
  '..#.#.#.#..',
  '...#...#...',
  '....###....',
  '...........',
];
const cuts = new Set();
petals.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && cuts.add(`${10 + i},${6 + j}`)));
for (let y = 15; y <= 19; y++) add(15, y);
for (let y = 20; y <= 25; y++) add(14, y);
for (const [x, y] of [[12, 19], [13, 19], [11, 20], [12, 20], [13, 20], [12, 21], [13, 21]]) add(x, y);
for (const [x, y] of [[16, 21], [17, 21], [16, 22], [17, 22], [18, 22], [16, 23], [17, 23]]) add(x, y);
const has = (x, y) => relief.has(`${x},${y}`);
const img = { w: N, h: N, px: Buffer.alloc(N * N * 4) };
const set = (x, y, [r, g, b]) => { const k = (y * N + x) * 4; img.px[k] = r; img.px[k + 1] = g; img.px[k + 2] = b; img.px[k + 3] = 255; };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
  if (d > 15.6) continue;
  if (d > 14.6) { set(x, y, RAMP.outline); continue; }
  const lit = dx + dy;
  if (d > 13.2) { set(x, y, lit < -6 ? RAMP.light : lit > 6 ? RAMP.dark : RAMP.mid); continue; }  // raised rim
  if (d > 12.4) { set(x, y, lit < 0 ? RAMP.mid : RAMP.light); continue; }                        // rim's inner bevel (lit opposite)
  // the face: lighter towards the top left
  let col = lit < -10 ? RAMP.faceHi : RAMP.face;
  if (has(x, y)) {
    col = RAMP.light;
    if (!has(x - 1, y) || !has(x, y - 1)) col = RAMP.shine;          // lit edge of the relief
    if (cuts.has(`${x},${y}`)) col = RAMP.mid;                        // petal lines
  } else if (has(x - 1, y - 1) || has(x - 1, y) || has(x, y - 1)) col = RAMP.shadow; // cast shadow bottom-right
  set(x, y, col);
}
// a small shine on the upper left of the face
for (const [x, y] of [[7, 8], [8, 7], [7, 9], [9, 6]]) if (!has(x, y)) set(x, y, RAMP.shine);
const small = { w: 16, h: 16, px: Buffer.alloc(16 * 16 * 4) };
for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
  const counts = new Map();
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const k = ((j * 2 + dy) * N + i * 2 + dx) * 4; const key = img.px.readUInt32BE(k); counts.set(key, (counts.get(key) ?? 0) + 1); }
  let best = 0, bestN = -1;
  for (const [key, n] of counts) {
    // prefer opaque, then the brighter colour on ties (keeps the rose's highlights)
    const score = n * 10 + ((key & 255) ? 5 : 0) + (((key >>> 24) & 255) + ((key >>> 16) & 255)) / 1000;
    if (score > bestN) { best = key; bestN = score; }
  }
  small.px.writeUInt32BE(best, (j * 16 + i) * 4);
}
const crcT = Array.from({ length: 256 }, (_, n) => { let cc = n; for (let i = 0; i < 8; i++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1; return cc >>> 0; });
const crc = (b) => { let cc = 0xffffffff; for (const x of b) cc = crcT[(cc ^ x) & 255] ^ (cc >>> 8); return (cc ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const k = Buffer.alloc(4); k.writeUInt32BE(crc(td)); return Buffer.concat([l, td, k]); };
const write = (file, im) => {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(im.w, 0); ih.writeUInt32BE(im.h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((im.w * 4 + 1) * im.h); for (let y = 0; y < im.h; y++) im.px.copy(raw, y * (im.w * 4 + 1) + 1, y * im.w * 4, (y + 1) * im.w * 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};
write(out32, img);
write(out16, small);
const P = { w: 32 * 8 + 16 * 8 + 16 * 2 + 60, h: 32 * 8 + 20, px: null };
P.px = Buffer.alloc(P.w * P.h * 4);
for (let i = 0; i < P.w * P.h; i++) P.px.writeUInt32BE(0x1b1b22ff, i * 4);
const blit = (im, k, ox, oy) => { for (let y = 0; y < im.h * k; y++) for (let x = 0; x < im.w * k; x++) { const s = (Math.floor(y / k) * im.w + Math.floor(x / k)) * 4; if (im.px[s + 3] === 0) continue; im.px.copy(P.px, ((y + oy) * P.w + x + ox) * 4, s, s + 4); } };
blit(img, 8, 10, 10);
blit(small, 8, 32 * 8 + 25, 10);
blit(small, 2, 32 * 8 + 16 * 8 + 40, 10);
write(preview, P);
console.log('ok');
