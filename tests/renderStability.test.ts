import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { SPRITE_FORGE_CHARACTER_VARIANTS } from '../src/assets/SpriteForgeCharacters';
import { approvedPlacement, NAMEPLATE_FALLBACK_HEIGHT, namePlateHeight } from '../src/characters/CharacterAnimator';
import { walkSpriteIdOf } from '../src/characters/CharacterAssetIds';
import { bodyNormalizeFor } from '../src/characters/CharacterBodyMetrics';
import { CHARACTER_CANVAS_ROOT, CHARACTER_FRAME_HEIGHT, CHARACTER_FRAME_WIDTH } from '../src/characters/CharacterSheetLayout';
import { StableCameraFollow, type FollowCamera } from '../src/render/StableCameraFollow';
import { readPng, type Rgba } from './helpers/png';

// ---------------------------------------------------------------------------------------------
// Camera follow: the followed character's SCREEN position may only move the way it really moves.
// ---------------------------------------------------------------------------------------------

function mockCamera(width = 960, height = 540): FollowCamera {
  return {
    width,
    height,
    scrollX: 0,
    scrollY: 0,
    setScroll(x: number, y: number) {
      this.scrollX = x;
      this.scrollY = y;
      return this;
    },
    clampX: (x: number) => x,
    clampY: (y: number) => y,
  };
}

interface Run {
  /** Screen x of the drawn character each frame (render - camera scroll), whole pixels. */
  screen: number[];
  integer: boolean;
}

/** Walks a target at `speed` px/ms for `walkFrames`, then stands for `restFrames`, with the given frame times. */
function simulate(speed: number, dts: number[], walkFrames: number, restFrames: number, legacy = false): Run {
  const cam = mockCamera();
  const follow = new StableCameraFollow(cam, { lerp: 0.12, offsetY: -24 });
  let x = 1000.25;
  follow.update(x, 500, 0);
  const screen: number[] = [];
  let integer = true;
  for (let f = 0; f < walkFrames + restFrames; f++) {
    const dt = dts[f % dts.length];
    if (f < walkFrames) x += speed * dt;
    follow.update(x, 500, dt);
    // legacy = what Phaser's own follow + roundPixels did: floor(world) - floor(lerped scroll).
    const drawn = legacy ? Math.floor(x) : follow.renderX(x);
    if (!Number.isInteger(drawn) || !Number.isInteger(cam.scrollX) || !Number.isInteger(cam.scrollY)) integer = false;
    screen.push(drawn - cam.scrollX);
  }
  return { screen, integer };
}

/** Number of times the screen motion changes direction (ignoring frames where it does not move). */
function reversals(values: number[]): number {
  let last = 0;
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    const d = Math.sign(values[i] - values[i - 1]);
    if (d === 0) continue;
    if (last !== 0 && d !== last) count++;
    last = d;
  }
  return count;
}

const SPEEDS = [0.045, 0.06, 0.0731, 0.11]; // px/ms: walking speeds incl. diagonal components and odd fractions

test('camera follow: zero screen jitter while walking at a steady frame rate (60 / 144 / 30 fps)', () => {
  for (const speed of SPEEDS) {
    for (const dt of [1000 / 60, 1000 / 144, 1000 / 30]) {
      const run = simulate(speed, [dt], 240, 0);
      assert.ok(run.integer, 'scroll and draw positions are whole pixels');
      assert.equal(reversals(run.screen), 0, `speed ${speed} dt ${dt.toFixed(2)}: ${run.screen.join(' ')}`);
    }
  }
});

test('camera follow: stopping only eases back once (no back-and-forth), then stays still', () => {
  for (const speed of SPEEDS) {
    const run = simulate(speed, [1000 / 60], 120, 180);
    // One reversal: the screen position grows while walking, then the camera recentres.
    assert.ok(reversals(run.screen) <= 1, `speed ${speed}: ${run.screen.join(' ')}`);
    const tail = run.screen.slice(-30);
    assert.ok(tail.every((v) => v === tail[0]), 'settles on one pixel');
  }
});

test('camera follow: repeated stop/start never shakes - one ease-back per stop at most', () => {
  const cam = mockCamera();
  const follow = new StableCameraFollow(cam, { lerp: 0.12 });
  let x = 333.3;
  follow.update(x, 0, 0);
  const screen: number[] = [];
  const cycles = 10;
  for (let c = 0; c < cycles; c++) {
    for (let f = 0; f < 25; f++) {
      x += 0.06 * (1000 / 60);
      follow.update(x, 0, 1000 / 60);
      screen.push(follow.renderX(x) - cam.scrollX);
    }
    for (let f = 0; f < 25; f++) {
      follow.update(x, 0, 1000 / 60);
      screen.push(follow.renderX(x) - cam.scrollX);
    }
  }
  // Walk -> forward, stop -> back: two direction changes per cycle at most (one per stop, one per start).
  assert.ok(reversals(screen) <= cycles * 2 - 1, `${reversals(screen)} reversals: ${screen.join(' ')}`);
});

test('camera follow: uneven frame times stay within 1 px of the true screen motion', () => {
  const run = simulate(0.06, [9, 24, 16, 11, 31, 16.7], 300, 0);
  assert.ok(run.integer);
  // With variable dt the EXACT camera lag itself wobbles slightly; the drawn position may
  // follow that sub-pixel wobble but must never step back by more than a pixel.
  for (let i = 1; i < run.screen.length; i++) assert.ok(run.screen[i] - run.screen[i - 1] >= -1, `frame ${i}`);
});

test('regression guard: the old floor(world) - floor(scroll) drawing did jitter', () => {
  // Proves the tests above would catch the original bug.
  const old = simulate(0.0731, [1000 / 60], 240, 0, true);
  assert.ok(reversals(old.screen) > 5, `legacy reversals ${reversals(old.screen)}`);
});

test('camera follow: frame-rate independent catch-up', () => {
  const at = (dt: number) => {
    const cam = mockCamera();
    const follow = new StableCameraFollow(cam, { lerp: 0.12 });
    follow.update(0, 0, 0);
    for (let elapsed = 0; elapsed < 500 - 1e-6; elapsed += dt) follow.update(100, 0, dt);
    return follow.exactScroll.x;
  };
  const a = at(1000 / 60);
  const b = at(1000 / 144);
  assert.ok(Math.abs(a - b) < 0.5, `60 fps ${a.toFixed(3)} vs 144 fps ${b.toFixed(3)}`);
});

// ---------------------------------------------------------------------------------------------
// Sprite anchor: one fixed root for every approved frame, static and walk alike.
// ---------------------------------------------------------------------------------------------

test('approved art: static and walk use the same canvas root and the same scale (no static<->walk hop)', () => {
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const s = approvedPlacement(v.spriteId);
    const w = approvedPlacement(walkSpriteIdOf(v.spriteId));
    assert.ok(s && w, `${v.key} is approved art`);
    assert.deepEqual(w, s, `${v.key}: walk placement == static placement`);
    assert.equal(s.originX * CHARACTER_FRAME_WIDTH, CHARACTER_CANVAS_ROOT.x);
    assert.equal(s.originY * CHARACTER_FRAME_HEIGHT, CHARACTER_CANVAS_ROOT.y);
    assert.equal(s.normalize, bodyNormalizeFor(v.spriteId));
    for (const alias of v.aliasSpriteIds) assert.deepEqual(approvedPlacement(alias), s, `${v.key} alias ${alias}`);
  }
  assert.equal(approvedPlacement('mockup_unknown_sheet'), null, 'unknown art keeps the measured fallback');
});

function frameRange(img: Rgba, col: number, row: number): { top: number; bottom: number } {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (img.data[(((row * 64 + y) * img.width) + col * 64 + x) * 4 + 3] >= 128) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { top, bottom };
}

const PUBLIC = path.join(process.cwd(), 'public');

test('approved art: every frame stands on the canvas root line (so one fixed origin is correct)', () => {
  // Pixel row `bottom` ends at y = bottom + 1. The front static frame ends exactly on the root line
  // (y 57); other frames may lift a foot (stride) or overhang by 1 px (art detail) - never more.
  const onRoot = (bottom: number) => bottom + 1 >= CHARACTER_CANVAS_ROOT.y - 2 && bottom + 1 <= CHARACTER_CANVAS_ROOT.y + 1;
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const st = readPng(path.join(PUBLIC, v.standing));
    assert.equal(frameRange(st, 0, 0).bottom + 1, CHARACTER_CANVAS_ROOT.y, `${v.key} front static frame: feet on the root line`);
    for (let i = 0; i < 8; i++) {
      const f = frameRange(st, i % 4, Math.floor(i / 4));
      assert.ok(onRoot(f.bottom), `${v.key} static frame ${i}: bottom ${f.bottom}`);
    }
    if (!v.walk) continue;
    const wk = readPng(path.join(PUBLIC, v.walk));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < v.walkFramesPerDirection; c++) {
        const f = frameRange(wk, c, r);
        assert.ok(onRoot(f.bottom), `${v.key} walk ${r}/${c}: bottom ${f.bottom}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Name plate: fixed height per appearance, never from the animated frame.
// ---------------------------------------------------------------------------------------------

test('name plate: one fixed height per appearance that clears every walk frame', () => {
  for (const v of SPRITE_FORGE_CHARACTER_VARIANTS) {
    const normalize = bodyNormalizeFor(v.spriteId)!;
    const st = readPng(path.join(PUBLIC, v.standing));
    const height = namePlateHeight(frameRange(st, 0, 0).top, normalize, 1);
    assert.ok(Number.isInteger(height), 'whole pixels');
    // Same inputs always give the same height - it cannot depend on the current frame.
    assert.equal(namePlateHeight(frameRange(st, 0, 0).top, normalize, 1), height);
    const clearance = (top: number) => height - (CHARACTER_CANVAS_ROOT.y - top) * normalize;
    for (let i = 0; i < 8; i++) assert.ok(clearance(frameRange(st, i % 4, Math.floor(i / 4)).top) >= 1, `${v.key} static ${i}`);
    if (!v.walk) continue;
    const wk = readPng(path.join(PUBLIC, v.walk));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < v.walkFramesPerDirection; c++) {
        assert.ok(clearance(frameRange(wk, c, r).top) >= 1, `${v.key} walk ${r}/${c}: plate overlaps the head`);
      }
    }
  }
});

test('name plate: scales with the display scale; unknown art uses the fallback', () => {
  assert.equal(namePlateHeight(null, null, 1), NAMEPLATE_FALLBACK_HEIGHT);
  assert.equal(namePlateHeight(null, 0.98, 2), NAMEPLATE_FALLBACK_HEIGHT * 2);
  assert.ok(namePlateHeight(10, 1, 3) > namePlateHeight(10, 1, 1) * 2.5);
});
