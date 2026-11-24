/**
 * EXP curve - editable progression data.
 *
 * Levels 1-9 use the early-game table (first map: Level 1 -> Level 10 takes 3,800 EXP). Level 10 is the
 * FIRST MAP target, not a cap: from Level 10 on, the curve that existed before this table is kept
 * unchanged (25 x L^1.5) until a designed curve replaces it. The overall maximum level is
 * STATUS_RULES.maxLevel (99).
 */

/** EXP needed to go from level L to L + 1, for the first map (L = 1..9). Edit here to rebalance. */
export const EARLY_EXP_TO_NEXT: Readonly<Record<number, number>> = {
  1: 80,
  2: 110,
  3: 140,
  4: 180,
  5: 220,
  6: 260,
  7: 310,
  8: 1_000,
  9: 1_500,
};

/** First map progression target (design goal: reached in ~15-20 min with Tutorial Quests - not verified). */
export const FIRST_MAP_TARGET_LEVEL = 10;

/** The pre-existing curve, kept for every level without a table entry (Level 10+). */
export function legacyExpToNextLevel(level: number): number {
  return Math.round(25 * Math.pow(level, 1.5));
}

/** EXP needed to go from `level` to `level + 1` (whole number). */
export function expToNextLevel(level: number): number {
  return EARLY_EXP_TO_NEXT[level] ?? legacyExpToNextLevel(level);
}

/** Total EXP from the start of `from` to the start of `to` (e.g. 1 -> 10 = 3,800). */
export function totalExpBetween(from: number, to: number): number {
  let total = 0;
  for (let l = from; l < to; l++) total += expToNextLevel(l);
  return total;
}
