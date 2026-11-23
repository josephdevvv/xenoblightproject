// Draws the hand-made item icons that have no source sheet (16x16, 1:1 pixel art, transparent background,
// no anti-aliasing) and writes them under public/assets/items. Re-running it reproduces the files exactly.
// Usage: node tools/draw-item-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Worn Cloth Armor (`armor_worn_cloth`): a short-sleeved cloth tunic seen from the front - dark brown body,
 * faded grey sleeves, a V neck, a rope belt, two stitched patches and a torn hem. One character per pixel.
 */
const WORN_CLOTH_ARMOR = {
  file: 'public/assets/items/armor/worn_cloth_armor_icon_16x16.png',
  colors: {
    o: '#0d0b0a', // outline
    n: '#1e1712', // inside of the neck
    L: '#7b5b41', // brown, lit edge
    B: '#56402f', // brown
    D: '#382a20', // brown, shaded edge
    H: '#a29c92', // grey, lit
    G: '#7a756e', // faded grey
    g: '#55514c', // grey, shaded / cuff
    r: '#8d7a5c', // rope belt
    p: '#6e665c', // patch
    s: '#b9a27a', // stitches
  },
  pixels: [
    '................',
    '...oooo..oooo...',
    '..oHHGLnnBGGgo..',
    '.oHGGLBnnBBGGgo.',
    'oHGGLBBBBBBDGGgo',
    'ogggLBBpsBBDgggo',
    '.oooLBBppBBDooo.',
    '...oLBBBBBBDo...',
    '...oLBBBBBBDo...',
    '...orrrrrrrro...',
    '...oLBBBBBBDo...',
    '..oLBBBBBpsBDo..',
    '..oLBBBBBppBDo..',
    '..oDBDBBDBBDDo..',
    '..oDoDDoDoDDo...',
    '...o.oo.o.oo....',
  ],
};

function drawIcon(icon) {
  const width = icon.pixels[0].length;
  const height = icon.pixels.length;
  const data = new Uint8Array(width * height * 4);
  icon.pixels.forEach((row, y) => {
    if (row.length !== width) throw new Error(`${icon.file}: row ${y} is ${row.length} wide`);
    [...row].forEach((c, x) => {
      if (c === '.') return;
      const hex = icon.colors[c];
      if (!hex) throw new Error(`${icon.file}: unknown colour "${c}" at ${x},${y}`);
      const i = (y * width + x) * 4;
      data.set([parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255], i);
    });
  });
  const file = path.join(ROOT, icon.file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writePng(file, { width, height, data });
  console.log(`wrote ${icon.file} (${width}x${height})`);
}

// ---------------------------------------------------------------------------------------------- PNG out
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(file, img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((img.width * 4 + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * img.width * 4, img.width * 4).copy(raw, y * (img.width * 4 + 1) + 1);
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

for (const icon of [WORN_CLOTH_ARMOR]) drawIcon(icon);
