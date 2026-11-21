import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MONSTER_ART, MONSTER_FACINGS, vfxDepthOffset, vfxOffset, type MonsterArtId } from '../src/monsters/art/MonsterArt';
import { MONSTER_CURSOR } from '../src/ui/world/MonsterCursor';
import { readPng } from './helpers/png';

test('attack VFX: in front of the monster facing SE / SW, behind it facing NE / NW', () => {
  assert.ok(vfxDepthOffset('SE') > 0);
  assert.ok(vfxDepthOffset('SW') > 0);
  assert.ok(vfxDepthOffset('NE') < 0);
  assert.ok(vfxDepthOffset('NW') < 0);
  // stays glued to its own monster: never a whole depth step away
  for (const f of MONSTER_FACINGS) assert.ok(Math.abs(vfxDepthOffset(f)) < 1);
});

test('monster cursor: the delivered sheet is 3 frames of 16 x 14, kept unmodified, hotspot on the blade tip', () => {
  const file = path.join(process.cwd(), 'public', MONSTER_CURSOR.url);
  const src = path.join(process.cwd(), 'art-source/ui/cursor/monster_target_cursor.png');
  assert.ok(fs.readFileSync(file).equals(fs.readFileSync(src)), 'game copy is byte-identical to the delivered file');
  const img = readPng(file);
  assert.equal(img.width, MONSTER_CURSOR.frameWidth * MONSTER_CURSOR.frames);
  assert.equal(img.height, MONSTER_CURSOR.frameHeight);
  const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
  for (let f = 0; f < MONSTER_CURSOR.frames; f++) {
    let n = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < MONSTER_CURSOR.frameWidth; x++) if (alpha(f * MONSTER_CURSOR.frameWidth + x, y)) n++;
    assert.ok(n > 20, `frame ${f + 1} has art`);
  }
  // hotspot = the sword tip in the hover / press frames (top-left opaque pixel of the blade)
  const { x, y } = MONSTER_CURSOR.hotspot;
  for (const f of [0, 1]) assert.equal(alpha(f * MONSTER_CURSOR.frameWidth + x, y), 255, `frame ${f + 1}: hotspot on an opaque pixel`);
  for (const f of [0, 1]) {
    for (let yy = 0; yy < y; yy++) for (let xx = x; xx < MONSTER_CURSOR.frameWidth; xx++) assert.equal(alpha(f * MONSTER_CURSOR.frameWidth + xx, yy), f === 0 ? 0 : alpha(f * MONSTER_CURSOR.frameWidth + xx, yy), 'nothing of the blade above the tip');
  }
  // crisp: fully opaque or fully transparent pixels only
  for (let i = 0; i < img.width * img.height; i++) assert.ok(img.data[i * 4 + 3] === 0 || img.data[i * 4 + 3] === 255);
});

test('monster cursor states: hover -> press -> release (once) -> hover; normal cursor off monsters', async () => {
  const { MonsterCursor } = await import('../src/ui/world/MonsterCursor');
  const canvas = { style: { cursor: '' } } as unknown as HTMLCanvasElement;
  const textures = { exists: () => false } as unknown as Phaser.Textures.TextureManager;
  const c = new MonsterCursor(canvas, textures);
  c.update(16, false);
  assert.equal(c.getState(), 'none');
  c.update(16, true);
  assert.equal(c.getState(), 'hover');
  c.press();
  assert.equal(c.getState(), 'press');
  c.update(16, true);
  assert.equal(c.getState(), 'press', 'stays pressed while the button is held');
  c.release(true);
  assert.equal(c.getState(), 'release');
  c.update(MONSTER_CURSOR.releaseMs / 2, true);
  assert.equal(c.getState(), 'release');
  c.update(MONSTER_CURSOR.releaseMs, true);
  assert.equal(c.getState(), 'hover', 'back to the hover frame');
  for (let i = 0; i < 20; i++) c.update(50, true);
  assert.equal(c.getState(), 'hover', 'no looping of the click frames');
  c.press();
  c.release(false);
  assert.equal(c.getState(), 'none', 'released away from the monster: normal cursor');
  c.update(16, true);
  c.update(16, false);
  assert.equal(c.getState(), 'none', 'leaving the monster restores the normal cursor');
});

test('attack VFX position on top of the measured offsets: mite NE +20 / NW -20, wolf NE +10 / NW -10; SE / SW and Y unchanged', () => {
  const nudge: Record<MonsterArtId, number> = { void_mite: 20, mutant_wolf: 10 };
  for (const art of Object.keys(MONSTER_ART) as MonsterArtId[]) {
    const measured = MONSTER_ART[art].meta.vfx.offsets;
    assert.deepEqual(vfxOffset(art, 'NE'), { x: measured.NE.x + nudge[art], y: measured.NE.y }, `${art} NE`);
    assert.deepEqual(vfxOffset(art, 'NW'), { x: measured.NW.x - nudge[art], y: measured.NW.y }, `${art} NW`);
    assert.deepEqual(vfxOffset(art, 'SE'), measured.SE, `${art} SE`);
    assert.deepEqual(vfxOffset(art, 'SW'), measured.SW, `${art} SW`);
  }
  // still behind the monster facing north
  assert.ok(vfxDepthOffset('NE') < 0 && vfxDepthOffset('NW') < 0);
});
