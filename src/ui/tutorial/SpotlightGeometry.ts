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

/** The screen minus `hole`: top, bottom, left, right pieces (never overlapping each other or the hole). */
export function surround(hole: Rect, screen: Size): [Rect, Rect, Rect, Rect] {
  const right = hole.x + hole.width;
  const bottom = hole.y + hole.height;
  return [
    { x: 0, y: 0, width: screen.width, height: hole.y },
    { x: 0, y: bottom, width: screen.width, height: screen.height - bottom },
    { x: 0, y: hole.y, width: hole.x, height: hole.height },
    { x: right, y: hole.y, width: screen.width - right, height: hole.height },
  ];
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

/** A rectangle in a scene's coordinates -> screen pixels (camera position, scroll and zoom). */
export function throughCamera(r: Rect, camera: { x: number; y: number; zoom: number; worldView: { x: number; y: number } }): Rect {
  return {
    x: camera.x + (r.x - camera.worldView.x) * camera.zoom,
    y: camera.y + (r.y - camera.worldView.y) * camera.zoom,
    width: r.width * camera.zoom,
    height: r.height * camera.zoom,
  };
}

/** A DOM element's client rectangle -> game-canvas pixels (window size, FIT scaling, browser zoom). */
export function clientToGame(element: Rect, canvas: Rect, game: Size): Rect | null {
  if (canvas.width <= 0 || canvas.height <= 0) return null;
  const sx = game.width / canvas.width;
  const sy = game.height / canvas.height;
  return { x: (element.x - canvas.x) * sx, y: (element.y - canvas.y) * sy, width: element.width * sx, height: element.height * sy };
}

/** Where a label of `size` goes: below the cutout, else above, else beside it - always on the screen. */
export function placeLabel(cut: Rect, size: Size, screen: Size, gap = 8): { x: number; y: number } {
  const centred = Math.min(Math.max(4, cut.x + cut.width / 2 - size.width / 2), screen.width - size.width - 4);
  let x = centred;
  let y: number;
  if (cut.y + cut.height + gap + size.height <= screen.height - 4) y = cut.y + cut.height + gap;
  else if (cut.y - gap - size.height >= 4) y = cut.y - gap - size.height;
  else {
    y = Math.min(Math.max(4, cut.y), screen.height - size.height - 4);
    x = cut.x - gap - size.width >= 4 ? cut.x - gap - size.width : cut.x + cut.width + gap;
  }
  return { x: Math.round(x), y: Math.round(y) };
}
