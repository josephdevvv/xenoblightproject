import type { StatBlock } from './StatTypes';

/**
 * TEMPORARY derived-stat formulas, all in one place so they are easy to tune.
 * Inputs are the character level and TOTAL main stats (base + bonus). Weapon stats are not included
 * yet, and nothing here is applied to gameplay yet.
 *
 * Percent values are stored as percentages (0.2 means 0.2 %).
 */
export interface DerivedStats {
  meleeAtk: number;
  rangedAtk: number;
  matk: number;
  maxHp: number;
  maxSp: number;
  def: number;
  mdef: number;
  hit: number;
  flee: number;
  /** % bonus to attack speed. */
  attackSpeedBonus: number;
  /** % chance. */
  critRate: number;
  /** % of normal damage. */
  critDamage: number;
  /** % RELATIVE bonus to future common-material drop chances (x1.0005 per LUK, not +0.05 points). */
  materialFindBonus: number;
}

export const DERIVED_FORMULAS: Readonly<Record<keyof DerivedStats, (level: number, t: StatBlock) => number>> = {
  meleeAtk: (_l, t) => 5 + t.str * 2,
  rangedAtk: (_l, t) => 5 + t.dex * 2,
  matk: (_l, t) => 5 + t.int * 2,
  maxHp: (_l, t) => 100 + t.vit * 20,
  maxSp: (_l, t) => 20 + t.int * 3,
  def: (_l, t) => t.vit,
  mdef: (_l, t) => t.vit * 0.5,
  hit: (level, t) => 100 + level * 2 + t.dex * 2,
  flee: (level, t) => 100 + level * 2 + t.agi,
  attackSpeedBonus: (_l, t) => t.agi * 0.2,
  critRate: (_l, t) => 5 + t.luk * 0.1,
  critDamage: () => 150,
  materialFindBonus: (_l, t) => t.luk * 0.05,
};

export function computeDerivedStats(level: number, total: StatBlock): DerivedStats {
  const out = {} as DerivedStats;
  for (const key of Object.keys(DERIVED_FORMULAS) as (keyof DerivedStats)[]) {
    out[key] = DERIVED_FORMULAS[key](level, total);
  }
  return out;
}

/** Display order, labels and units for the Status window. */
export const DERIVED_DISPLAY: ReadonlyArray<{ key: keyof DerivedStats; label: string; percent?: boolean; note?: string }> = [
  { key: 'meleeAtk', label: 'Melee ATK' },
  { key: 'rangedAtk', label: 'Ranged ATK' },
  { key: 'matk', label: 'MATK' },
  { key: 'maxHp', label: 'Max HP' },
  { key: 'maxSp', label: 'Max SP' },
  { key: 'def', label: 'DEF' },
  { key: 'mdef', label: 'MDEF' },
  { key: 'hit', label: 'HIT' },
  { key: 'flee', label: 'FLEE' },
  { key: 'attackSpeedBonus', label: 'Attack Speed', percent: true, note: 'bonus' },
  { key: 'critRate', label: 'Critical Rate', percent: true },
  { key: 'critDamage', label: 'Critical Damage', percent: true },
  { key: 'materialFindBonus', label: 'Material Find', percent: true, note: 'relative' },
];

/** At most two decimals, no trailing zeros, no floating-point noise (5.1, 0.05, 120). */
export function formatStatValue(value: number, percent = false): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return percent ? `${text}%` : text;
}
