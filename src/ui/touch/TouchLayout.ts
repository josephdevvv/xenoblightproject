import type { Point } from '../../core/types';

/**
 * Mobile touch controls - pure layout and input math (unit-tested), whole pixels, in game pixels (960 x 480; the
 * canvas is scaled to the screen, so ~0.8x on a phone: 46 px buttons are ~37 CSS px, the sword ~55).
 *
 *   bottom-left    the virtual joystick (fixed base; a touch anywhere in its grab circle takes it)
 *   bottom-right   the action wheel: the big sword (normal attack) with four hotkey buttons on an arc around its
 *                  upper-left, and a small tab button switching them between slots 1-4 and 5-8
 *   next to it     the HP (Q) and SP (W) potion buttons, side by side, the same size and style as the hotkeys
 */
export interface Circle {
  x: number;
  y: number;
  r: number;
}

export const TOUCH = {
  joystick: { radius: 52, knob: 20, grab: 84, deadzone: 0.18, inset: 40 },
  sword: { radius: 34, inset: 42 },
  /** Hotkey buttons: on an arc around the sword (screen angles in degrees, 0 = right, 90 = down). */
  slot: { radius: 23, arc: 88, angles: [175, 210, 245, 280] as const },
  tab: { radius: 14, distance: 72, angle: 322 },
  potion: { radius: 23, gap: 6, fromSword: 142, bottom: 40 },
} as const;

/** Hotkey buttons shown at once (two pages: slots 1-4, 5-8). */
export const TOUCH_SLOTS_PER_PAGE = 4;

export interface TouchLayout {
  joystick: Circle & { grab: number; knob: number };
  sword: Circle;
  /** The four hotkey buttons of the page shown. */
  slots: readonly [Circle, Circle, Circle, Circle];
  tab: Circle;
  potions: { hp: Circle; sp: Circle };
}

export function touchLayout(screenWidth: number, screenHeight: number): TouchLayout {
  const J = TOUCH.joystick;
  const S = TOUCH.sword;
  const joystick = { x: J.inset + J.radius, y: screenHeight - J.inset - J.radius - 8, r: J.radius, grab: J.grab, knob: J.knob };
  const sword = { x: screenWidth - S.inset - S.radius, y: screenHeight - S.inset - S.radius, r: S.radius };
  const around = (angle: number, distance: number, r: number): Circle => ({
    x: Math.round(sword.x + Math.cos((angle * Math.PI) / 180) * distance),
    y: Math.round(sword.y + Math.sin((angle * Math.PI) / 180) * distance),
    r,
  });
  const slots = TOUCH.slot.angles.map((a) => around(a, TOUCH.slot.arc, TOUCH.slot.radius)) as unknown as TouchLayout['slots'];
  const tab = around(TOUCH.tab.angle, TOUCH.tab.distance, TOUCH.tab.radius);
  const P = TOUCH.potion;
  const sp = { x: sword.x - P.fromSword, y: screenHeight - P.bottom, r: P.radius };
  const hp = { x: sp.x - 2 * P.radius - P.gap, y: sp.y, r: P.radius };
  return { joystick, sword, slots, tab, potions: { hp, sp } };
}

/** The hotbar slot (0-7) a button of the page shows. */
export function slotOfButton(page: 0 | 1, button: number): number {
  return page * TOUCH_SLOTS_PER_PAGE + button;
}

export interface JoystickState {
  /** Knob offset from the base centre (clamped to the base radius, whole pixels). */
  knob: Point;
  /** Screen-space unit direction, or null inside the dead zone. */
  direction: Point | null;
}

/** The knob follows the finger inside the base; outside the dead zone it gives a direction (full speed). */
export function joystickState(dx: number, dy: number, radius: number, deadzone: number): JoystickState {
  const length = Math.hypot(dx, dy);
  const k = length > radius ? radius / length : 1;
  const knob = { x: Math.round(dx * k), y: Math.round(dy * k) };
  if (length <= deadzone * radius || length === 0) return { knob, direction: null };
  return { knob, direction: { x: dx / length, y: dy / length } };
}

/**
 * A screen direction -> the ground (tile-space) direction that moves the character that way on screen.
 * Isometric: screen x = (tx - ty) * 32, screen y = (tx + ty) * 16. Unit length.
 */
export function screenToGround(direction: Point): Point {
  const tx = direction.x / 64 + direction.y / 32;
  const ty = direction.y / 32 - direction.x / 64;
  const length = Math.hypot(tx, ty);
  return length === 0 ? { x: 0, y: 0 } : { x: tx / length, y: ty / length };
}

export function inCircle(c: Circle, x: number, y: number, r = c.r): boolean {
  return Math.hypot(x - c.x, y - c.y) <= r;
}
