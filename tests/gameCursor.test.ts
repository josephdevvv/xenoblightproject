import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { GAME_CURSOR } from '../src/ui/cursor/GameCursor';
import { readPng } from './helpers/png';

const shipped = path.join(process.cwd(), 'public', GAME_CURSOR.url);
const img = readPng(shipped);
const px = (x: number, y: number) => {
  const o = (y * img.width + x) * 4;
  return { r: img.data[o], g: img.data[o + 1], b: img.data[o + 2], a: img.data[o + 3] };
};
const isOutline = (x: number, y: number) => {
  const p = px(x, y);
  return p.a === 255 && p.r < 60 && p.g < 60 && p.b < 80;
};

test('game cursor: delivered sheet shipped unchanged, two frames that hold all of its pixels', () => {
  const delivered = path.join(process.cwd(), 'art-source/ui/cursor/game_cursor.png');
  assert.ok(fs.readFileSync(shipped).equals(fs.readFileSync(delivered)), 'byte-identical copy');
  assert.equal(img.width, GAME_CURSOR.sheetWidth);
  assert.equal(img.height, GAME_CURSOR.sheetHeight);
  assert.equal(GAME_CURSOR.frames.length, 2);
  // every visible pixel of the sheet is inside one of the frame rectangles (nothing cut off)
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (!px(x, y).a) continue;
    assert.ok(GAME_CURSOR.frames.some(([fx, fy, w, h]) => x >= fx && x < fx + w && y >= fy && y < fy + h), `pixel ${x},${y} is in a frame`);
  }
  // hard alpha only: crisp, no blur
  for (let i = 3; i < img.data.length; i += 4) assert.ok(img.data[i] === 0 || img.data[i] === 255);
});

test('game cursor: the dark outline sits on the same pixels in both frames, the hotspot is its tip', () => {
  const outline = (f: number) => {
    const [fx, fy, w, h] = GAME_CURSOR.frames[f];
    const set: string[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isOutline(fx + x, fy + y)) set.push(`${x},${y}`);
    return set;
  };
  assert.deepEqual(outline(1), outline(0), 'frames aligned: the click point does not move between states');
  const [fx, fy] = GAME_CURSOR.frames[0];
  const { x: hx, y: hy } = GAME_CURSOR.hotspot;
  assert.ok(isOutline(fx + hx, fy + hy), 'hotspot is on the cursor');
  // the tip is the top-left-most pixel of the shape: nothing above it or to its left
  for (let y = 0; y < GAME_CURSOR.frames[0][3]; y++) for (let x = 0; x < GAME_CURSOR.frames[0][2]; x++) {
    if (!isOutline(fx + x, fy + y)) continue;
    assert.ok(y >= hy && x >= hx, `outline pixel ${x},${y} is not above / left of the tip`);
  }
  assert.ok(Number.isInteger(GAME_CURSOR.scale) && GAME_CURSOR.scale >= 1, 'integer scale (no distortion)');
});
