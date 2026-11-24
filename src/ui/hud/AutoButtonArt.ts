/**
 * The AUTO button's pixel art - pure (no Phaser), unit-tested. A dark disc in a 2-px gold ring with a dark inner
 * line, and two gold circular-arrow arcs (top and bottom, arrowheads at their ends) - drawn pixel by pixel, so it is
 * crisp at the game's scale. Four looks: normal, hover (brighter), on (bright gold, warm disc, the arrows turn: 8
 * pre-drawn phases over half a turn - they repeat every 180 degrees) and disabled (gray).
 */
export type AutoButtonState = 'normal' | 'hover' | 'on' | 'disabled';
export const AUTO_BUTTON_STATES: readonly AutoButtonState[] = ['normal', 'hover', 'on', 'disabled'];

/** Width / height of the art (odd: one centre pixel). */
export const AUTO_ICON_SIZE = 35;
/** Phases of the turning arrows (over 180 degrees). */
export const AUTO_ARROW_PHASES = 8;
/** One phase step while on. */
export const AUTO_ARROW_STEP_MS = 90;

type Rgb = readonly [number, number, number];

interface Palette {
  ringHi: Rgb;
  ring: Rgb;
  ringLo: Rgb;
  inner: Rgb;
  disc: Rgb;
  discEdge: Rgb;
  arrow: Rgb;
}

const hex = (v: number): Rgb => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

export const AUTO_PALETTES: Readonly<Record<AutoButtonState, Palette>> = {
  normal: { ringHi: hex(0xe6c77a), ring: hex(0xc49a45), ringLo: hex(0x7d5f26), inner: hex(0x0b0b0d), disc: hex(0x1b1b22), discEdge: hex(0x121216), arrow: hex(0xb08a3e) },
  hover: { ringHi: hex(0xfff0b0), ring: hex(0xe2b75a), ringLo: hex(0x9a7530), inner: hex(0x0b0b0d), disc: hex(0x22222a), discEdge: hex(0x16161b), arrow: hex(0xd8ad55) },
  on: { ringHi: hex(0xfff2b8), ring: hex(0xf0c25a), ringLo: hex(0xa87a28), inner: hex(0x0b0b0d), disc: hex(0x2a1f12), discEdge: hex(0x1c150c), arrow: hex(0xffd76a) },
  disabled: { ringHi: hex(0x6a6a70), ring: hex(0x55555b), ringLo: hex(0x3a3a40), inner: hex(0x0b0b0d), disc: hex(0x151518), discEdge: hex(0x101012), arrow: hex(0x45454c) },
};

/** Text colour of "AUTO" on each look. */
export const AUTO_TEXT_COLORS: Readonly<Record<AutoButtonState, string>> = {
  normal: '#e8e8ec',
  hover: '#ffffff',
  on: '#ffe9a8',
  disabled: '#6c6c75',
};

const C = (AUTO_ICON_SIZE - 1) / 2;
const R_OUT = C + 0.5;
const RING = 2;
/** The arrows' circle (1 px wide) inside the disc. */
const R_ARROW = 12;
/** Arc spans (degrees, screen space: 0 = right, increasing clockwise) before turning. */
const ARCS: readonly (readonly [number, number])[] = [
  [-150, -40],
  [30, 140],
];
/** Arrowhead length along the circle (degrees) and its half width at the base (px). */
const HEAD_DEG = 14;
const HEAD_HALF = 2.5;

function put(px: Uint8ClampedArray, x: number, y: number, [r, g, b]: Rgb): void {
  const i = (y * AUTO_ICON_SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = 255;
}

/** Ring and disc (RGBA, AUTO_ICON_SIZE squared). Outside the circle: transparent. */
export function autoBasePixels(state: AutoButtonState): Uint8ClampedArray {
  const p = AUTO_PALETTES[state];
  const px = new Uint8ClampedArray(AUTO_ICON_SIZE * AUTO_ICON_SIZE * 4);
  for (let y = 0; y < AUTO_ICON_SIZE; y++) {
    for (let x = 0; x < AUTO_ICON_SIZE; x++) {
      const dx = x - C;
      const dy = y - C;
      const d = Math.hypot(dx, dy);
      if (d > R_OUT) continue;
      if (d > R_OUT - RING) {
        // lit from the top left
        const light = dx + dy;
        put(px, x, y, light < -8 ? p.ringHi : light > 8 ? p.ringLo : p.ring);
      } else if (d > R_OUT - RING - 1) put(px, x, y, p.inner);
      else put(px, x, y, d > R_OUT - RING - 3 ? p.discEdge : p.disc);
    }
  }
  return px;
}

const norm = (deg: number): number => ((deg % 360) + 360) % 360;
/** Degrees from `from` clockwise to `to`, 0..360. */
const span = (from: number, to: number): number => norm(to - from);

/**
 * The two circular arrows, turned by `phase` (0..AUTO_ARROW_PHASES-1, half a turn in all), RGBA; transparent
 * elsewhere, so it is drawn over the base.
 */
export function autoArrowPixels(state: AutoButtonState, phase: number): Uint8ClampedArray {
  const p = AUTO_PALETTES[state];
  const turn = (180 / AUTO_ARROW_PHASES) * (((phase % AUTO_ARROW_PHASES) + AUTO_ARROW_PHASES) % AUTO_ARROW_PHASES);
  const px = new Uint8ClampedArray(AUTO_ICON_SIZE * AUTO_ICON_SIZE * 4);
  for (let y = 0; y < AUTO_ICON_SIZE; y++) {
    for (let x = 0; x < AUTO_ICON_SIZE; x++) {
      const dx = x - C;
      const dy = y - C;
      const r = Math.hypot(dx, dy);
      if (r < R_ARROW - HEAD_HALF - 0.5 || r > R_ARROW + HEAD_HALF + 0.5) continue;
      const a = norm((Math.atan2(dy, dx) * 180) / Math.PI);
      for (const [from, to] of ARCS) {
        const start = from + turn;
        const length = to - from;
        const along = span(start, a);
        // the arc: a 1-px line on the circle
        if (along <= length && Math.abs(r - R_ARROW) <= 0.5) {
          put(px, x, y, p.arrow);
          break;
        }
        // the arrowhead past the arc's clockwise end: a triangle narrowing to its tip
        const past = along - length;
        if (past >= 0 && past <= HEAD_DEG && Math.abs(r - R_ARROW) <= HEAD_HALF * (1 - past / HEAD_DEG) + 0.35) {
          put(px, x, y, p.arrow);
          break;
        }
      }
    }
  }
  return px;
}

/** Texture keys (one per look; the arrows also per phase). */
export const autoBaseKey = (state: AutoButtonState): string => `hud.auto.base.${state}`;
export const autoArrowKey = (state: AutoButtonState, phase: number): string => `hud.auto.arrows.${state}.${phase}`;

/** Which look the button has: disabled first, then on, then hover. */
export function autoButtonState(on: boolean, hover: boolean, enabled: boolean): AutoButtonState {
  if (!enabled) return 'disabled';
  if (on) return 'on';
  return hover ? 'hover' : 'normal';
}

/** The arrows' phase now: turning only while on, from the clock (never a timer of its own). */
export function autoArrowPhase(state: AutoButtonState, nowMs: number): number {
  return state === 'on' ? Math.floor(nowMs / AUTO_ARROW_STEP_MS) % AUTO_ARROW_PHASES : 0;
}
