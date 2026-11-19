/**
 * Character status: level, six main stats and spendable stat points.
 *
 * Stats are split into BASE (raised with stat points, capped at 99), BONUS (future equipment /
 * passives, starts at 0, not saved - it will be recomputed from its sources) and TOTAL (base + bonus,
 * may exceed 99). Derived stats always use TOTAL (see DerivedStats.ts).
 */

export const MAIN_STATS = ['str', 'dex', 'int', 'vit', 'agi', 'luk'] as const;
export type MainStat = (typeof MAIN_STATS)[number];
export type StatBlock = Record<MainStat, number>;

/** Short label and what each main stat affects (shown in the Status window). */
export const MAIN_STAT_INFO: Readonly<Record<MainStat, { label: string; description: string }>> = {
  str: { label: 'STR', description: 'Melee physical attack' },
  dex: { label: 'DEX', description: 'Ranged physical attack, HIT' },
  int: { label: 'INT', description: 'Magic attack, Max SP' },
  vit: { label: 'VIT', description: 'Max HP, DEF, MDEF' },
  agi: { label: 'AGI', description: 'Attack speed bonus, FLEE' },
  luk: { label: 'LUK', description: 'Critical rate, material find' },
};

export const STATUS_RULES = {
  startingLevel: 1,
  maxLevel: 99,
  startingStat: 1,
  maxBaseStat: 99,
  /** Points gained for every level from 2 to maxLevel (98 levels x 3 = 294). */
  pointsPerLevel: 3,
  /** Stat points spent per +1 base stat. */
  costPerStat: 1,
} as const;

export interface CharacterStatus {
  level: number;
  base: StatBlock;
  /** Future equipment / passive bonuses. Always 0 for now. */
  bonus: StatBlock;
  /** Unspent stat points. */
  statPoints: number;
}

export function createStatBlock(value: number): StatBlock {
  return { str: value, dex: value, int: value, vit: value, agi: value, luk: value };
}

/** A brand-new character: level 1, every stat 1, no points. */
export function createInitialStatus(): CharacterStatus {
  return {
    level: STATUS_RULES.startingLevel,
    base: createStatBlock(STATUS_RULES.startingStat),
    bonus: createStatBlock(0),
    statPoints: 0,
  };
}

export function cloneStatus(s: CharacterStatus): CharacterStatus {
  return { level: s.level, base: { ...s.base }, bonus: { ...s.bonus }, statPoints: s.statPoints };
}

export function totalStats(s: CharacterStatus): StatBlock {
  const total = createStatBlock(0);
  for (const stat of MAIN_STATS) total[stat] = s.base[stat] + s.bonus[stat];
  return total;
}

/** Total stat points a character earns by reaching `level` (0 at level 1, 294 at level 99). */
export function pointsEarnedAtLevel(level: number): number {
  const clamped = Math.min(Math.max(Math.floor(level), STATUS_RULES.startingLevel), STATUS_RULES.maxLevel);
  return (clamped - STATUS_RULES.startingLevel) * STATUS_RULES.pointsPerLevel;
}

/** Points already invested in base stats. */
export function pointsSpent(s: CharacterStatus): number {
  let spent = 0;
  for (const stat of MAIN_STATS) spent += (s.base[stat] - STATUS_RULES.startingStat) * STATUS_RULES.costPerStat;
  return spent;
}

/**
 * Future leveling hook (no EXP / level-up gameplay exists yet). Raises the level to `newLevel`
 * (capped at 99) and awards 3 points for each level actually gained - never twice for the same
 * level, and never for levels at or below the current one. Returns the number of points awarded.
 */
export function applyLevelUp(s: CharacterStatus, newLevel: number): number {
  const target = Math.min(Math.floor(newLevel), STATUS_RULES.maxLevel);
  if (!Number.isFinite(target) || target <= s.level) return 0;
  const awarded = pointsEarnedAtLevel(target) - pointsEarnedAtLevel(s.level);
  s.level = target;
  s.statPoints += awarded;
  return awarded;
}
