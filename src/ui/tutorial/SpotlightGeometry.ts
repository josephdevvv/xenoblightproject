/** Geometry of the tutorial spotlight - pure, unit-tested. Rectangles are game-canvas pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Grown by `pad` on every side, on whole pixels, kept on the screen. */
export function padRect(r: Rect, pad: number, screen: Size): Rect {
  const x = Math.max(0, Math.floor(r.x) - pad);
  const y = Math.max(0, Math.floor(r.y) - pad);
  const right = Math.min(screen.width, Math.ceil(r.x + r.width) + pad);
  const bottom = Math.min(screen.height, Math.ceil(r.y + r.height) + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * The screen minus some holes (the lit target, and e.g. the guide line the step waits for), as rectangles that
 * never overlap each other or a hole: horizontal bands between the holes' edges, each split around the holes
 * crossing it. Holes may overlap each other. Empty pieces are left out.
 */
export function outside(holes: readonly Rect[], screen: Size): Rect[] {
  const clip = (v: number, max: number): number => Math.min(max, Math.max(0, v));
  const hs = holes
    .map((h) => ({ x0: clip(h.x, screen.width), y0: clip(h.y, screen.height), x1: clip(h.x + h.width, screen.width), y1: clip(h.y + h.height, screen.height) }))
    .filter((h) => h.x1 > h.x0 && h.y1 > h.y0);
  const ys = [...new Set([0, screen.height, ...hs.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const [top, bottom] = [ys[i], ys[i + 1]];
    // the holes crossing this band cover it from top to bottom (their edges are band edges): merge their spans
    const spans = hs.filter((h) => h.y0 <= top && h.y1 >= bottom).map((h) => [h.x0, h.x1] as const).sort((a, b) => a[0] - b[0]);
    let x = 0;
    for (const [x0, x1] of spans) {
      if (x0 > x) out.push({ x, y: top, width: x0 - x, height: bottom - top });
      x = Math.max(x, x1);
    }
    if (x < screen.width) out.push({ x, y: top, width: screen.width - x, height: bottom - top });
  }
  return out;
}

/** Something of it can be seen and clicked. */
export function isOnScreen(r: Rect, screen: Size): boolean {
  return r.width > 0 && r.height > 0 && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.x < screen.width && r.y < screen.height && r.x + r.width > 0 && r.y + r.height > 0;
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  const at = (p: number, q: number): number => Math.round(p + (q - p) * t);
  return { x: at(a.x, b.x), y: at(a.y, b.y), width: at(a.width, b.width), height: at(a.height, b.height) };
}

/** The camera fields that place what it draws (a Phaser camera has them all). */
export interface CameraView {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Zoom pivot, 0-1 of the camera size (the in-game UI cameras zoom from their top-left: 0). */
  originX: number;
  originY: number;
  scrollX: number;
  scrollY: number;
  zoomX: number;
  zoomY: number;
}

/**
 * A rectangle in a scene's coordinates -> screen pixels, exactly as the camera draws it (and hit-tests clicks):
 * Phaser's camera matrix is translate(round(x + ox), round(y + oy)) . zoom . translate(-ox, -oy), applied after the
 * scroll, with o = origin x size. (Not `worldView`: that is centred on the camera whatever its origin, so a UI
 * camera zoomed from its top-left corner would put every spotlight off its control at any UI scale but 100 %.)
 */
export function throughCamera(r: Rect, camera: CameraView): Rect {
  const ox = camera.width * camera.originX;
  const oy = camera.height * camera.originY;
  return {
    x: Math.floor(camera.x + ox + 0.5) + (r.x - camera.scrollX - ox) * camera.zoomX,
    y: Math.floor(camera.y + oy + 0.5) + (r.y - camera.scrollY - oy) * camera.zoomY,
    width: r.width * camera.zoomX,
    height: r.height * camera.zoomY,
  };
}

/** 2D affine transform (a b c d e f, as Phaser's TransformMatrix): x' = a x + c y + e, y' = b x + d y + f. */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** The box around a rectangle after a transform (a container's world transform: position, scale, rotation, parents). */
export function transformRect(r: Rect, m: Affine): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]) {
    xs.push(m.a * x + m.c * y + m.e);
    ys.push(m.b * x + m.d * y + m.f);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** A DOM element's client rectangle -> game-canvas pixels (window size, FIT scaling, browser zoom). */
export function clientToGame(element: Rect, canvas: Rect, game: Size): Rect | null {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  const sx = game.width / canvas.width;
  const sy = game.height / canvas.height;
  return { x: (element.x - canvas.x) * sx, y: (element.y - canvas.y) * sy, width: element.width * sx, height: element.height * sy };
}

/** The two rectangles share some area. */
export const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where a label of `size` goes: below the cutout, else above, else beside it - always on the screen, and off the
 * `avoid` areas (other lit areas, such as the guide line) wherever one of those places allows it.
 */
export function placeLabel(cut: Rect, size: Size, screen: Size, gap = 8, avoid: readonly Rect[] = []): { x: number; y: number } {
  const centred = Math.min(Math.max(4, cut.x + cut.width / 2 - size.width / 2), screen.width - size.width - 4);
  const besideY = Math.min(Math.max(4, cut.y), screen.height - size.height - 4);
  const places = [
    { x: centred, y: cut.y + cut.height + gap },
    { x: centred, y: cut.y - gap - size.height },
    { x: cut.x - gap - size.width, y: besideY },
    { x: cut.x + cut.width + gap, y: besideY },
  ];
  const fits = (p: { x: number; y: number }): boolean => p.x >= 4 && p.y >= 4 && p.x + size.width <= screen.width - 4 && p.y + size.height <= screen.height - 4;
  const clear = (p: { x: number; y: number }): boolean => !avoid.some((a) => overlaps({ ...p, ...size }, a));
  const at = places.find((p) => fits(p) && clear(p)) ?? places.slice(0, 2).find(fits) ?? (places[2].x >= 4 ? places[2] : places[3]);
  return { x: Math.round(at.x), y: Math.round(at.y) };
}
