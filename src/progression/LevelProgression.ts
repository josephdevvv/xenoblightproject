import { expToNextLevel } from './ExpCurve';

/**
 * Level-up processing - pure, unit-tested. EXP is a whole number of progress towards the next level.
 * A reward may cross several levels: the excess carries over each time. At the maximum level progress
 * stays 0. Invalid input (negative, fractional, NaN) is cleaned up, never trusted.
 */
export interface ExpResult {
  level: number;
  exp: number;
  levelsGained: number;
}

export function addExp(level: number, exp: number, gained: number, maxLevel: number): ExpResult {
  let l = Math.max(1, Math.floor(level));
  let e = Math.max(0, Number.isFinite(exp) ? Math.floor(exp) : 0) + Math.max(0, Number.isFinite(gained) ? Math.floor(gained) : 0);
  let levelsGained = 0;
  while (l < maxLevel && e >= expToNextLevel(l)) {
    e -= expToNextLevel(l);
    l++;
    levelsGained++;
  }
  if (l >= maxLevel) e = 0;
  return { level: l, exp: e, levelsGained };
}

/** Share of the current level done, 0..1 (the HUD EXP bar); 1 at the maximum level. */
export function levelProgress(level: number, exp: number, maxLevel: number): number {
  if (level >= maxLevel) return 1;
  return Math.min(1, Math.max(0, exp) / expToNextLevel(level));
}

/**
 * Kill rewards are paid once per monster LIFE: a respawned monster pays again, the same death never
 * twice (the server-side ledger in multiplayer). Keys are `<monster id>#<life>`.
 */
export class KillRewardLedger {
  private readonly paid = new Set<string>();

  /** True the first time a kill is claimed, false for any repeat. */
  claim(monsterId: string, life: number): boolean {
    const key = `${monsterId}#${life}`;
    if (this.paid.has(key)) return false;
    this.paid.add(key);
    return true;
  }

  get size(): number {
    return this.paid.size;
  }
}
