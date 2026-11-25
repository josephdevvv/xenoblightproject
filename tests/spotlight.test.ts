import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { clientToGame, isOnScreen, lerpRect, padRect, placeLabel, sameRect, surround, throughCamera, transformRect, type CameraView, type Rect } from '../src/ui/tutorial/SpotlightGeometry';

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

const cam = (over: Partial<CameraView> = {}): CameraView => ({ x: 0, y: 0, width: 960, height: 480, originX: 0.5, originY: 0.5, scrollX: 0, scrollY: 0, zoomX: 1, zoomY: 1, ...over });

test('camera: scroll, zoom, zoom pivot and viewport offset are followed exactly as Phaser draws', () => {
  const r = { x: 100, y: 60, width: 20, height: 10 };
  assert.deepEqual(throughCamera(r, cam()), r);
  // the in-game UI cameras zoom from their top-left: a HUD point (x, y) is drawn at (x, y) x zoom
  for (const zoom of [1, 1.2, 1.25, 1.5, 2, 3]) {
    assert.deepEqual(throughCamera(r, cam({ originX: 0, originY: 0, zoomX: zoom, zoomY: zoom })), { x: 100 * zoom, y: 60 * zoom, width: 20 * zoom, height: 10 * zoom }, `zoom ${zoom}`);
  }
  // a centred pivot (Phaser default): the middle of the camera stays put
  assert.deepEqual(throughCamera({ x: 480, y: 240, width: 0, height: 0 }, cam({ zoomX: 2, zoomY: 2 })), { x: 480, y: 240, width: 0, height: 0 });
  // scroll and a viewport offset
  assert.deepEqual(throughCamera(r, cam({ x: 5, y: 7, originX: 0, originY: 0, scrollX: 90, scrollY: 50, zoomX: 2, zoomY: 2 })), { x: 25, y: 27, width: 40, height: 20 });
});

test('regression: a UI camera zoomed from its top-left - the spotlight lands on the control at every UI scale', () => {
  // at 150 % on a 960 x 720 view Phaser reports worldView (160, 120) for such a camera: using it put the Status
  // button's spotlight at (472, -165) instead of (712.5, 15) - off the screen
  const button = { x: 475, y: 10, width: 17, height: 13 };
  const hud = cam({ width: 960, height: 720, originX: 0, originY: 0, zoomX: 1.5, zoomY: 1.5 });
  assert.deepEqual(throughCamera(button, hud), { x: 712.5, y: 15, width: 25.5, height: 19.5 });
});

test('container transform: position, scale and parents are all applied to an area inside a window', () => {
  const r = { x: 10, y: 20, width: 30, height: 40 };
  assert.deepEqual(transformRect(r, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), r);
  assert.deepEqual(transformRect(r, { a: 1, b: 0, c: 0, d: 1, e: 100, f: 50 }), { x: 110, y: 70, width: 30, height: 40 }, "moved window");
  assert.deepEqual(transformRect(r, { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }), { x: 120, y: 90, width: 60, height: 80 }, "scaled (e.g. a parent at 2x)");
  assert.deepEqual(transformRect(r, { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }), { x: -40, y: 20, width: 30, height: 40 }, "flipped: still a proper box");
});

test('every tutorial step measures its target where it is drawn now: no stored window coordinates', () => {
  const read = (f: string): string => fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n');
  const overlay = read('src/ui/tutorial/SpotlightOverlay.ts');
  assert.match(overlay, /throughCamera\(transformRect\(local, container\.getWorldTransformMatrix\(\)\), cameraOf\(scene, container\)\)/);
  assert.match(overlay, /const b = object\.getBounds\(\);/, 'controls: their rendered bounds, parents included');
  for (const f of ['src/ui/StatusWindow.ts', 'src/ui/inventory/InventoryWindow.ts', 'src/ui/hotbar/HotbarAssignWindow.ts', 'src/ui/autoplay/AutoPlayWindow.ts']) {
    const src = read(f);
    assert.match(src, /rectInContainer\(this\.scene, this\.root, \{ x, y, width, height \}\)/, `${f}: measured through its container`);
    assert.doesNotMatch(src, /throughCamera\(|wx \+ x|wy \+ y|wx \+ c\[0\]/, `${f}: no window position baked in`);
  }
  assert.doesNotMatch(read('src/ui/tutorial/SpotlightGeometry.ts'), /worldView\.[xy]/, 'never the centred worldView');
  // the rectangle is read every frame (it follows UI scale changes, resizes, rotations and layout changes)
  assert.match(overlay, /const rect = target\?\.rect\(\) \?\? null;/);
  const ui = read('src/scenes/GameUIScene.ts');
  assert.match(ui, /this\.spotlightOverlay\?\.update\(delta, this\.spotlightTarget\(\)\);/);
  // the label: screen layer (above every window), at the HUD's UI scale, placed beside the cutout in screen pixels
  assert.match(overlay, /setData\(UI_LAYER_KEY, 'screen'\);/);
  assert.match(overlay, /this\.label\.setScale\(z\)\.setData\(TEXT_RESOLUTION_KEY, z\);/);
  assert.match(overlay, /this\.label\.setPosition\(at\.x, at\.y\);/);
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
