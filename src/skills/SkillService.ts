import type { CharacterData } from '../data/CharacterData';
import { createSkills, hasLearned, learnSkill, type SkillsState } from './LearnedSkills';
import type { SkillId } from './SkillDefinitions';

type Listener = (character: CharacterData, skill: SkillId) => void;
const listeners = new Set<Listener>();

/** The single place that changes which skills a character has learned (skill scrolls). Never unlearns. */
export const SkillService = {
  state(character: CharacterData): SkillsState {
    return character.skills ?? createSkills();
  },

  isLearned(character: CharacterData, id: string): boolean {
    return hasLearned(character.skills, id);
  },

  /** Learns a skill for good. False = already learned or unknown (nothing changes). */
  learn(character: CharacterData, id: SkillId): boolean {
    const next = learnSkill(this.state(character), id);
    if (!next) return false;
    character.skills = next;
    for (const l of listeners) l(character, id);
    return true;
  },

  onLearned(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
