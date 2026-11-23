import { isSkillId, type SkillId } from './SkillDefinitions';

/** The skills a character has learned (from skill scrolls) - pure. Kept in the character and in save files. */
export interface SkillsState {
  readonly learned: readonly SkillId[];
}

export function createSkills(): SkillsState {
  return { learned: [] };
}

export function hasLearned(s: SkillsState | undefined, id: string): boolean {
  return !!s && (s.learned as readonly string[]).includes(id);
}

/** Learns a skill. null = already learned or not a skill (nothing changes). */
export function learnSkill(s: SkillsState, id: string): SkillsState | null {
  if (!isSkillId(id) || hasLearned(s, id)) return null;
  return { learned: [...s.learned, id] };
}

/** Stored data -> valid state: known skill ids, each once. Missing data = nothing learned. */
export function sanitizeSkills(raw: unknown): { state: SkillsState; dropped: string[] } {
  const dropped: string[] = [];
  if (raw === undefined || raw === null) return { state: createSkills(), dropped };
  const list = (raw as { learned?: unknown }).learned;
  if (typeof raw !== 'object' || !Array.isArray(list)) return { state: createSkills(), dropped: ['skills'] };
  const learned: SkillId[] = [];
  for (const id of list) {
    if (isSkillId(id) && !learned.includes(id)) learned.push(id);
    else dropped.push(`skills: ${String(id)}`);
  }
  return { state: { learned }, dropped };
}
