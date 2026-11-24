// The 12 x 12 Gold coin (the 16 x 16 icon reduced ~20 % - 12 px is the HUD name row's height): drawn pixel by pixel on its own grid with the 32 x 32
// master's colour ramp - rim lit from the top left, a tiny raised rose - so it stays crisp at 1x (no resampling).
// Usage: node make_gold_coin_12.mjs <out12.png> <preview.png>
import fs from 'node:fs';
import zlib from 'node:zlib';
const [out12, preview] = process.argv.slice(2);
const N = 12, c = (N - 1) / 2;
const RAMP = { outline: [0x2a, 0x1a, 0x05], dark: [0x7a, 0x50, 0x12], mid: [0xb8, 0x86, 0x22], face: [0xd9, 0xa8, 0x34], faceHi: [0xe8, 0xbd, 0x45], light: [0xf8, 0xdc, 0x78], shine: [0xff, 0xf3, 0xb8], shadow: [0x96, 0x68, 0x18] };
// the rose: 'r' raised, 'c' petal cut, 's' stem / leaf - cell (0, 0) is coin pixel (RX, RY)
const ROSE = [
  '.rrr.',
  'rrcrr',
  'rcrcr',
  '.rrr.',
  '..s..',
  '.s.s.',
];
const RX = Math.floor((N - 5) / 2), RY = Math.floor((N - 6) / 2);
const rose = new Map();
ROSE.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && rose.set(`${RX + i},${RY + j}`, ch)));
const raised = (x, y) => rose.has(`${x},${y}`);
const img = { w: N, h: N, px: Buffer.alloc(N * N * 4) };
const set = (x, y, [r, g, b]) => { const k = (y * N + x) * 4; img.px[k] = r; img.px[k + 1] = g; img.px[k + 2] = b; img.px[k + 3] = 255; };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
  if (d > N / 2) continue;
  if (d > N / 2 - 0.9) { set(x, y, RAMP.outline); continue; }
  const lit = dx + dy;
  if (d > N / 2 - 1.9) { set(x, y, lit < -2 ? RAMP.light : lit > 2 ? RAMP.dark : RAMP.mid); continue; } // the raised rim
  let col = lit < -4 ? RAMP.faceHi : RAMP.face;
  const cell = rose.get(`${x},${y}`);
  if (cell === 'c') col = RAMP.mid;
  else if (cell === 's') col = RAMP.light;
  else if (cell === 'r') col = !raised(x - 1, y) || !raised(x, y - 1) ? RAMP.shine : RAMP.light;
  else if (raised(x - 1, y - 1) || raised(x - 1, y) || raised(x, y - 1)) col = RAMP.shadow; // cast shadow, bottom right
  set(x, y, col);
}
const crcT = Array.from({ length: 256 }, (_, n) => { let cc = n; for (let i = 0; i < 8; i++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1; return cc >>> 0; });
const crc = (b) => { let cc = 0xffffffff; for (const x of b) cc = crcT[(cc ^ x) & 255] ^ (cc >>> 8); return (cc ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const k = Buffer.alloc(4); k.writeUInt32BE(crc(td)); return Buffer.concat([l, td, k]); };
const write = (file, im) => {
  const ih = Buffer.alloc(13); ih.writeUInt32BE(im.w, 0); ih.writeUInt32BE(im.h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((im.w * 4 + 1) * im.h); for (let y = 0; y < im.h; y++) im.px.copy(raw, y * (im.w * 4 + 1) + 1, y * im.w * 4, (y + 1) * im.w * 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};
write(out12, img);
if (preview) {
  const k = 16, P = { w: N * k + 20, h: N * k + 20, px: Buffer.alloc((N * k + 20) * (N * k + 20) * 4) };
  for (let i = 0; i < P.w * P.h; i++) P.px.writeUInt32BE(0x1b1b22ff, i * 4);
  for (let y = 0; y < N * k; y++) for (let x = 0; x < N * k; x++) { const s = (Math.floor(y / k) * N + Math.floor(x / k)) * 4; if (img.px[s + 3]) img.px.copy(P.px, ((y + 10) * P.w + x + 10) * 4, s, s + 4); }
  write(preview, P);
}
console.log('ok');
