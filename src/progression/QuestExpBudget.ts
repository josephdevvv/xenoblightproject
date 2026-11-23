/**
 * Tutorial Quest EXP budget for Levels 1-10. Each quest that pays EXP is listed in `allocations` (stable quest
 * id -> EXP); QuestRewards pays exactly that through CharacterStatusService.gainExp, once. Monster EXP is
 * separate and not part of this budget. The check below keeps the allocations inside the planned budget; the
 * rest stays unassigned (never paid by itself).
 */
export const TUTORIAL_QUEST_EXP_BUDGET = {
  /** Planned EXP from Tutorial Quests across Levels 1-10 (about 900). */
  total: 900,
  /** Per-quest rewards. */
  allocations: {
    tutorial_02_rusty_dagger: 100,
    tutorial_03_void_mite_hunt: 200,
    // tutorial_04_potion_training pays nothing
    tutorial_05_mutant_wolf_hunt: 150,
  } as Readonly<Record<string, number>>,
} as const;

export function allocatedQuestExp(allocations: Readonly<Record<string, number>> = TUTORIAL_QUEST_EXP_BUDGET.allocations): number {
  return Object.values(allocations).reduce((sum, v) => sum + v, 0);
}

/** EXP of one quest's reward (0 when it pays none). */
export function questExpReward(questId: string): number {
  return TUTORIAL_QUEST_EXP_BUDGET.allocations[questId] ?? 0;
}

/** EXP still unassigned in the budget. */
export function remainingQuestExp(allocations: Readonly<Record<string, number>> = TUTORIAL_QUEST_EXP_BUDGET.allocations): number {
  return TUTORIAL_QUEST_EXP_BUDGET.total - allocatedQuestExp(allocations);
}

/** Problems with a set of quest allocations (whole, positive numbers within the budget). Empty = valid. */
export function validateQuestAllocations(allocations: Readonly<Record<string, number>>): string[] {
  const errors: string[] = [];
  for (const [id, exp] of Object.entries(allocations)) {
    if (!Number.isInteger(exp) || exp <= 0) errors.push(`${id}: EXP must be a positive whole number`);
  }
  if (allocatedQuestExp(allocations) > TUTORIAL_QUEST_EXP_BUDGET.total) errors.push(`allocations exceed the ${TUTORIAL_QUEST_EXP_BUDGET.total} EXP budget`);
  return errors;
}
