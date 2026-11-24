import { clampAspd, finalAspd } from './Aspd';
import type { DerivedStats } from './DerivedStats';

/**
 * Bonuses on DERIVED stats from outside the main stats (passive trees now; equipment later). Every
 * source produces its own DerivedBonus; they are summed with combineDerivedBonuses() and applied once
 * on top of the formula values, so sources never overwrite each other and nothing is applied twice.
 *
 *   flat:          added to the formula value (percent stats add percentage points)
 *   maxHpPercent:  Max HP = (formula Max HP + flat Max HP) x (1 + maxHpPercent / 100)
 *   ASPD:          flat.aspdPercent closes that % of the gap to 81, then flat.aspd adds points; clamped 0..74
 */
/** A derived stat, or aspdPercent (the percentage ASPD bonus - not a stat of its own). */
export type DerivedBonusKey = keyof DerivedStats | 'aspdPercent';

export interface DerivedBonus {
  flat: Partial<Record<DerivedBonusKey, number>>;
  maxHpPercent: number;
}

export function emptyDerivedBonus(): DerivedBonus {
  return { flat: {}, maxHpPercent: 0 };
}

export function combineDerivedBonuses(...bonuses: readonly DerivedBonus[]): DerivedBonus {
  const out = emptyDerivedBonus();
  for (const b of bonuses) {
    for (const [key, value] of Object.entries(b.flat) as [DerivedBonusKey, number][]) out.flat[key] = (out.flat[key] ?? 0) + value;
    out.maxHpPercent += b.maxHpPercent;
  }
  return out;
}

/**
 * Returns a new object: formula values + flat bonuses, then the Max HP multiplier. HP is a whole number:
 * the multiplied Max HP is rounded DOWN (125 x 1.10 = 137.5 -> 137), so Status, HUD and combat agree.
 * ASPD: the formula gives the raw value; percent, then flat, then the 0..74 clamp (Aspd.finalAspd).
 */
export function applyDerivedBonus(base: DerivedStats, bonus: DerivedBonus): DerivedStats {
  const out = { ...base };
  for (const [key, value] of Object.entries(bonus.flat) as [DerivedBonusKey, number][]) {
    if (key !== 'aspd' && key !== 'aspdPercent') out[key] += value;
  }
  out.aspd = bonus.flat.aspd || bonus.flat.aspdPercent ? finalAspd(base.aspd, bonus.flat.aspdPercent ?? 0, bonus.flat.aspd ?? 0) : clampAspd(base.aspd);
  if (bonus.maxHpPercent !== 0) out.maxHp = Math.floor(out.maxHp * (1 + bonus.maxHpPercent / 100) + 1e-9);
  return out;
}
