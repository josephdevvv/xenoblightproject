import { rawAspd } from './Aspd';
import type { StatBlock } from './StatTypes';

/**
 * Derived-stat formulas (Drifter, status rebalance 2026-11-24), all in one place. Inputs are the character level and
 * TOTAL main stats (base + bonus); equipment and passive bonuses are added afterwards (DerivedBonuses), once.
 *
 * Every main stat starts at 1, so linear scaling uses (stat - 1): a Lv 1 character with all stats at 1 has
 * exactly the base values. HIT and FLEE keep their +2 per level. Decimals are kept (0.5 per point).
 *
 *   STR  Melee ATK +0.5            AGI  FLEE +0.5, ASPD (Aspd.ts)
 *   VIT  Max HP +6, DEF / MDEF +0.25   INT  MATK +0.5, Max SP +1
 *   DEX  Ranged ATK +0.5, HIT +1, ASPD   LUK  Crit Rate +0.1 %, Material Find +0.05 %
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
  /** Attack speed points, 0..74 (Aspd.ts): the time between basic attacks is 20 x (81 - ASPD) ms. */
  aspd: number;
  /** % chance. */
  critRate: number;
  /** % of normal damage. */
  critDamage: number;
  /** % RELATIVE bonus to future common-material drop chances (x1.0005 per LUK, not +0.05 points). */
  materialFindBonus: number;
}

export const DERIVED_FORMULAS: Readonly<Record<keyof DerivedStats, (level: number, t: StatBlock) => number>> = {
  meleeAtk: (_l, t) => 6 + (t.str - 1) * 0.5,
  rangedAtk: (_l, t) => 6 + (t.dex - 1) * 0.5,
  matk: (_l, t) => 6 + (t.int - 1) * 0.5,
  maxHp: (_l, t) => 100 + (t.vit - 1) * 6,
  maxSp: (_l, t) => 20 + (t.int - 1),
  def: (_l, t) => 1 + (t.vit - 1) * 0.25,
  mdef: (_l, t) => 0.5 + (t.vit - 1) * 0.25,
  // +2 per level kept: 104 / 103 at Lv 1
  hit: (level, t) => 102 + level * 2 + (t.dex - 1),
  flee: (level, t) => 101 + level * 2 + (t.agi - 1) * 0.5,
  // raw ASPD (base 11 + AGI / DEX); percent / flat bonuses and the 0..74 clamp come in applyDerivedBonus
  aspd: (_l, t) => rawAspd(t.agi, t.dex),
  critRate: (_l, t) => 5 + (t.luk - 1) * 0.1,
  critDamage: () => 150,
  materialFindBonus: (_l, t) => (t.luk - 1) * 0.05,
};

export function computeDerivedStats(level: number, total: StatBlock): DerivedStats {
  const out = {} as DerivedStats;
  for (const key of Object.keys(DERIVED_FORMULAS) as (keyof DerivedStats)[]) {
    out[key] = DERIVED_FORMULAS[key](level, total);
  }
  return out;
}

/**
 * Display order and units for the Status window. Labels are translated (status.derived.<key> in
 * src/i18n); Material Find is labelled as a relative bonus there.
 */
export const DERIVED_DISPLAY: ReadonlyArray<{ key: keyof DerivedStats; percent?: boolean }> = [
  { key: 'meleeAtk' },
  { key: 'rangedAtk' },
  { key: 'matk' },
  { key: 'maxHp' },
  { key: 'maxSp' },
  { key: 'def' },
  { key: 'mdef' },
  { key: 'hit' },
  { key: 'flee' },
  { key: 'aspd' },
  { key: 'critRate', percent: true },
  { key: 'critDamage', percent: true },
  { key: 'materialFindBonus', percent: true },
];

/** At most two decimals, no trailing zeros, no floating-point noise (5.1, 0.05, 120). */
export function formatStatValue(value: number, percent = false): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return percent ? `${text}%` : text;
}
