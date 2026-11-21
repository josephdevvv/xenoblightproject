import type { MonsterId } from '../monsters/MonsterDefinition';

/**
 * EXP per kill - editable balancing data (initial values for the first map, not final). Kept apart from
 * the monsters' combat stats: changing a reward never touches HP, ATK, HIT, AI or spawns.
 *
 * Reference pacing (design, not verified by play tests): 20 Void Mites x 20 + 25 Mutant Wolves x 32
 * = 1,200 monster EXP, plus the Tutorial Quest budget (900) = 2,100 for Level 1 -> 10 (needs 2,080).
 */
export const MONSTER_EXP_REWARDS: Readonly<Record<MonsterId, number>> = {
  voidmite: 20,
  mutant_wolf: 32,
};

/** EXP for one kill of a monster (whole number, never negative; unknown monsters give 0). */
export function monsterExpReward(id: MonsterId): number {
  const exp = MONSTER_EXP_REWARDS[id];
  return Number.isFinite(exp) ? Math.max(0, Math.floor(exp)) : 0;
}
