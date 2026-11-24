/**
 * ASPD (attack speed) - pure, unit-tested. A higher ASPD means a shorter time between basic attacks:
 *
 *   statASPD  = 0.96 x (sqrt(9.999 x AGI + 0.19212 x DEX) - sqrt(10.19112))   (0 at AGI 1 / DEX 1)
 *   rawASPD   = class base ASPD + statASPD
 *   finalASPD = clamp(rawASPD + (81 - rawASPD) x percent / 100 + flat, 0, 74)
 *   interval  = 20 x (81 - finalASPD) ms        attacks / s = 1000 / interval
 *
 * Percent bonuses (Swiftness, equipment) close part of the gap to 81; flat bonuses add ASPD points. Values keep
 * their decimals (the Status window shows two).
 */
export const ASPD_RULES = {
  min: 0,
  max: 74,
  /** The interval reaches 0 ms at this ASPD (never reached: max is 74 = 140 ms). */
  ceiling: 81,
  msPerPoint: 20,
} as const;

/** Base ASPD per class (Lv 1, AGI / DEX 1). */
export const CLASS_BASE_ASPD = {
  drifter: 11,
} as const;

/** sqrt(9.999 + 0.19212): the stat term at AGI 1 / DEX 1. */
const STAT_ZERO = Math.sqrt(10.19112);

/** ASPD from AGI and DEX (total values): 0 at 1 / 1, growing with diminishing returns. */
export function statAspd(agi: number, dex: number): number {
  return Math.max(0, 0.96 * (Math.sqrt(9.999 * agi + 0.19212 * dex) - STAT_ZERO));
}

/** Class base + stats, before bonuses. */
export function rawAspd(agi: number, dex: number, base: number = CLASS_BASE_ASPD.drifter): number {
  return base + statAspd(agi, dex);
}

export function clampAspd(aspd: number): number {
  return Math.min(ASPD_RULES.max, Math.max(ASPD_RULES.min, aspd));
}

/** Raw ASPD + percent bonus (of the gap to 81) + flat bonus, clamped to 0..74. */
export function finalAspd(raw: number, percent = 0, flat = 0): number {
  return clampAspd(raw + (ASPD_RULES.ceiling - raw) * (percent / 100) + flat);
}

/** Time between basic attacks at this ASPD (clamped): 1,400 ms at 11, 140 ms at 74. */
export function aspdIntervalMs(aspd: number): number {
  return ASPD_RULES.msPerPoint * (ASPD_RULES.ceiling - clampAspd(aspd));
}

export function attacksPerSecond(aspd: number): number {
  return 1000 / aspdIntervalMs(aspd);
}
