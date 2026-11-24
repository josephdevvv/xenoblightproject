import type { MonsterId } from '../monsters/MonsterDefinition';

/**
 * Gold per kill - editable balancing data, kept apart from the monsters' combat stats (like MonsterExpRewards).
 * Paid once per monster life, together with the EXP (CombatSystem's kill credit).
 */
export const MONSTER_GOLD_REWARDS: Readonly<Record<MonsterId, number>> = {
  voidmite: 1,
  mutant_wolf: 3,
  dark_avian: 5,
};

/** Gold for one kill of a monster (whole number, never negative; unknown monsters give 0). */
export function monsterGoldReward(id: MonsterId): number {
  const gold = MONSTER_GOLD_REWARDS[id];
  return Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
}
