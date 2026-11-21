import type { DerivedStats } from './DerivedStats';

/**
 * Bonuses on DERIVED stats from outside the main stats (passive trees now; equipment later). Every
 * source produces its own DerivedBonus; they are summed with combineDerivedBonuses() and applied once
 * on top of the formula values, so sources never overwrite each other and nothing is applied twice.
 *
 *   flat:          added to the formula value (percent stats add percentage points)
 *   maxHpPercent:  Max HP = (formula Max HP + flat Max HP) x (1 + maxHpPercent / 100)
 */
export interface DerivedBonus {
  flat: Partial<Record<keyof DerivedStats, number>>;
  maxHpPercent: number;
}

export function emptyDerivedBonus(): DerivedBonus {
  return { flat: {}, maxHpPercent: 0 };
}

export function combineDerivedBonuses(...bonuses: readonly DerivedBonus[]): DerivedBonus {
  const out = emptyDerivedBonus();
  for (const b of bonuses) {
    for (const [key, value] of Object.entries(b.flat) as [keyof DerivedStats, number][]) out.flat[key] = (out.flat[key] ?? 0) + value;
    out.maxHpPercent += b.maxHpPercent;
  }
  return out;
}

/**
 * Returns a new object: formula values + flat bonuses, then the Max HP multiplier. HP is a whole number:
 * the multiplied Max HP is rounded DOWN (125 x 1.10 = 137.5 -> 137), so Status, HUD and combat agree.
 */
export function applyDerivedBonus(base: DerivedStats, bonus: DerivedBonus): DerivedStats {
  const out = { ...base };
  for (const [key, value] of Object.entries(bonus.flat) as [keyof DerivedStats, number][]) out[key] += value;
  if (bonus.maxHpPercent !== 0) out.maxHp = Math.floor(out.maxHp * (1 + bonus.maxHpPercent / 100) + 1e-9);
  return out;
}
