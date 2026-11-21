/**
 * Tutorial Quest EXP budget for Levels 1-10 - RESERVED, NOT AWARDED.
 *
 * Tutorial Quests are not designed yet: there are no quests, objectives, triggers or NPCs, and nothing
 * here grants EXP. When the quests are designed, list each one in `allocations` (stable quest id -> EXP)
 * and pay it through CharacterStatusService.gainExp when that quest completes. The check below keeps the
 * allocations inside the planned budget.
 */
export const TUTORIAL_QUEST_EXP_BUDGET = {
  /** Planned EXP from Tutorial Quests across Levels 1-10 (about 900). */
  total: 900,
  /** Per-quest rewards: empty until the quests exist. */
  allocations: {} as Readonly<Record<string, number>>,
} as const;

export function allocatedQuestExp(allocations: Readonly<Record<string, number>> = TUTORIAL_QUEST_EXP_BUDGET.allocations): number {
  return Object.values(allocations).reduce((sum, v) => sum + v, 0);
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
