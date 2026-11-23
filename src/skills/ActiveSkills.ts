import type { CharacterData } from '../data/CharacterData';
import { isSkillId, SKILL_IDS, type SkillId } from './SkillDefinitions';
import { SkillService } from './SkillService';

/**
 * Active skills a hotbar slot may hold (`{ type: 'skill', skillId }`): every registered skill (SkillDefinitions).
 * A skill is usable only once its skill scroll was used (SkillService); a locked skill cannot be assigned or
 * used, and no key fires a skill directly - only the hotbar keys 1-8.
 */
export type ActiveSkillId = SkillId;

export const ACTIVE_SKILL_IDS: readonly ActiveSkillId[] = SKILL_IDS;

export function isActiveSkillId(id: string): id is ActiveSkillId {
  return isSkillId(id);
}

/** Can this character use the skill? Only after learning it from its scroll. */
export function isSkillUnlocked(character: CharacterData, id: string): boolean {
  return isSkillId(id) && SkillService.isLearned(character, id);
}
