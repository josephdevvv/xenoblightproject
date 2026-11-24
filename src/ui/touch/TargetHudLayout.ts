/**
 * Mobile target HUD - pure layout (unit-tested, no Phaser), whole pixels: top-centre, the selected monster's name over
 * a long metal bar with pointed ends and a GREEN HP bar inside - no numbers. The view is TargetHud.
 */
export const TARGET_HUD = {
  /** The HP bar's inside (the green part at full HP). */
  barWidth: 220,
  barHeight: 6,
  /** Metal frame around the bar, and the pointed ends' length. */
  frame: 2,
  point: 7,
  /** The name's top and the bar's top (below the name). */
  nameTop: 4,
  barTop: 24,
} as const;

export interface TargetHudLayout {
  centerX: number;
  nameTop: number;
  /** The green bar's full rectangle. */
  bar: { x: number; y: number; width: number; height: number };
  /** The frame's outer rectangle (without the pointed ends). */
  frame: { x: number; y: number; width: number; height: number };
}

export function targetHudLayout(screenWidth: number): TargetHudLayout {
  const T = TARGET_HUD;
  const centerX = Math.floor(screenWidth / 2);
  const bar = { x: centerX - T.barWidth / 2, y: T.barTop, width: T.barWidth, height: T.barHeight };
  const frame = { x: bar.x - T.frame, y: bar.y - T.frame, width: bar.width + 2 * T.frame, height: bar.height + 2 * T.frame };
  return { centerX, nameTop: T.nameTop, bar, frame };
}

/** Width of the green part: whole pixels, at least 1 while the monster lives. */
export function hpFillWidth(hp: number, maxHp: number, width: number): number {
  if (!(maxHp > 0) || !(hp > 0)) return 0;
  return Math.max(1, Math.min(width, Math.round((hp / maxHp) * width)));
}

/** What the target HUD shows: a name and HP (only the bar is drawn - never the numbers). */
export interface TargetInfo {
  name: string;
  hp: number;
  maxHp: number;
}
