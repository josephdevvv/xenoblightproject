import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientToGame, isOnScreen, lerpRect, padRect, placeLabel, sameRect, surround, throughCamera, type Rect } from '../src/ui/tutorial/SpotlightGeometry';

const SCREENS = [
  { width: 960, height: 480 },
  { width: 1280, height: 720 },
  { width: 640, height: 360 },
];
const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;

function* targets(screen: { width: number; height: number }): Generator<Rect> {
  let seed = 11;
  const next = (n: number): number => (seed = (seed * 16807) % 2147483647) % n;
  for (let i = 0; i < 60; i++) yield { x: next(screen.width + 60) - 30 + next(4) / 4, y: next(screen.height + 60) - 30 + next(4) / 4, width: 1 + next(200), height: 1 + next(90) };
  yield { x: 0, y: 0, width: 20, height: 20 };
  yield { x: screen.width - 20, y: screen.height - 20, width: 20, height: 20 };
  yield { x: 0, y: 0, width: screen.width, height: screen.height };
}

test('blockers: the whole screen except the target, every pixel exactly once, wherever the target is', () => {
  for (const screen of SCREENS) {
    for (const t of targets(screen)) {
      if (!isOnScreen(t, screen)) continue;
      const hole = padRect(t, 0, screen);
      const pieces = surround(hole, screen);
      assert.ok(pieces.every((p) => p.width >= 0 && p.height >= 0), JSON.stringify(t));
      const area = pieces.reduce((s, p) => s + p.width * p.height, 0) + hole.width * hole.height;
      assert.equal(area, screen.width * screen.height, JSON.stringify(t));
      for (let x = 0.5; x < screen.width; x += 37) {
        for (let y = 0.5; y < screen.height; y += 23) {
          const hits = pieces.filter((p) => inside(p, x, y)).length;
          assert.equal(hits, inside(hole, x, y) ? 0 : 1);
        }
      }
    }
  }
});

test('the visible part of the target is never covered; the cutout always surrounds it', () => {
  for (const screen of SCREENS) {
    for (const t of targets(screen)) {
      if (!isOnScreen(t, screen)) continue;
      const hole = padRect(t, 0, screen);
      const cut = padRect(t, 5, screen);
      const left = Math.max(0, t.x), top = Math.max(0, t.y), right = Math.min(screen.width, t.x + t.width), bottom = Math.min(screen.height, t.y + t.height);
      for (const r of [hole, cut]) assert.ok(r.x <= left && r.y <= top && r.x + r.width >= right && r.y + r.height >= bottom, JSON.stringify(t));
      for (const v of [cut.x, cut.y, cut.width, cut.height]) assert.ok(Number.isInteger(v), 'pixel-aligned');
      assert.ok(cut.x <= hole.x && cut.y <= hole.y && cut.x >= 0 && cut.x + cut.width <= screen.width && cut.y + cut.height <= screen.height);
    }
  }
});

test('no usable target: nothing to light', () => {
  const s = SCREENS[0];
  for (const r of [
    { x: 10, y: 10, width: 0, height: 5 },
    { x: 10, y: 10, width: 5, height: -1 },
    { x: 960, y: 10, width: 5, height: 5 },
    { x: -5, y: 10, width: 5, height: 5 },
    { x: 10, y: 480, width: 5, height: 5 },
    { x: Number.NaN, y: 0, width: 5, height: 5 },
    { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 5 },
  ]) assert.equal(isOnScreen(r, s), false, JSON.stringify(r));
  assert.equal(isOnScreen({ x: -4, y: 479, width: 5, height: 5 }, s), true, 'one visible pixel is enough');
});

test('camera: scroll, zoom and viewport offset are followed', () => {
  const r = { x: 100, y: 60, width: 20, height: 10 };
  const camera = { x: 0, y: 0, zoom: 1, worldView: { x: 0, y: 0 } };
  assert.deepEqual(throughCamera(r, camera), r);
  assert.deepEqual(throughCamera(r, { x: 5, y: 7, zoom: 2, worldView: { x: 90, y: 50 } }), { x: 25, y: 27, width: 40, height: 20 });
});

test('DOM targets: window size, FIT scaling, letterboxing and browser zoom are followed', () => {
  const game = { width: 960, height: 480 };
  // canvas shown at half size, 40 px below the top of the page
  assert.deepEqual(clientToGame({ x: 100, y: 90, width: 50, height: 20 }, { x: 0, y: 40, width: 480, height: 240 }, game), { x: 200, y: 100, width: 100, height: 40 });
  // browser zoom scales both: the result stays the same
  for (const zoom of [0.5, 0.8, 1, 1.25, 2]) {
    const r = clientToGame({ x: 100 * zoom, y: 90 * zoom, width: 50 * zoom, height: 20 * zoom }, { x: 0, y: 40 * zoom, width: 480 * zoom, height: 240 * zoom }, game)!;
    assert.deepEqual([r.x, r.y, r.width, r.height].map((v) => Math.round(v * 1000) / 1000), [200, 100, 100, 40]);
  }
  assert.equal(clientToGame({ x: 0, y: 0, width: 5, height: 5 }, { x: 0, y: 0, width: 0, height: 0 }, game), null, 'hidden canvas');
});

test('gliding between steps: whole pixels, exact at both ends', () => {
  const a = { x: 900, y: 100, width: 26, height: 26 };
  const b = { x: 301, y: 222, width: 71, height: 43 };
  assert.deepEqual(lerpRect(a, b, 0), a);
  assert.deepEqual(lerpRect(a, b, 1), b);
  for (let i = 0; i <= 10; i++) for (const v of Object.values(lerpRect(a, b, i / 10))) assert.ok(Number.isInteger(v));
  assert.ok(sameRect(a, { ...a }) && sameRect(null, null) && !sameRect(a, b) && !sameRect(a, null));
});

test('label: on the screen and never over the cutout', () => {
  const size = { width: 220, height: 24 };
  for (const screen of SCREENS) {
    for (const t of targets(screen)) {
      if (!isOnScreen(t, screen) || t.width > 120) continue;
      const cut = padRect(t, 5, screen);
      const p = placeLabel(cut, size, screen, 10);
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + size.width <= screen.width && p.y + size.height <= screen.height, JSON.stringify({ t, p }));
      const overlaps = p.x < cut.x + cut.width && p.x + size.width > cut.x && p.y < cut.y + cut.height && p.y + size.height > cut.y;
      assert.equal(overlaps, false, JSON.stringify({ t, p }));
    }
  }
});
