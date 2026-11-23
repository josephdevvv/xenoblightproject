import type { CharacterData } from '../data/CharacterData';
import { PLAYER_ATTACKS, type PlayerAttackId } from '../combat/PlayerAttacks';

/**
 * Active skills a hotbar slot may hold (`{ type: 'skill', skillId }`): the registered player attacks except the
 * basic attack. Their definitions, animations and VFX stay as they are.
 *
 * SKILLS ARE DISABLED for now: no skill is unlocked, granted or usable, and no key fires one. How skills are
 * acquired will be designed later; until then isSkillUnlocked() is false for every skill, so a skill entry on
 * the hotbar (e.g. from a future save) is kept but does nothing.
 */
export type ActiveSkillId = Exclude<PlayerAttackId, 'basic'>;

export const ACTIVE_SKILL_IDS: readonly ActiveSkillId[] = (Object.keys(PLAYER_ATTACKS) as PlayerAttackId[]).filter((id): id is ActiveSkillId => id !== 'basic');

export function isActiveSkillId(id: string): id is ActiveSkillId {
  return (ACTIVE_SKILL_IDS as readonly string[]).includes(id);
}

/**
 * Can this character use the skill now? No unlock rule exists yet, so: never. (The future skill-unlock system
 * answers this per character; activation will then go through the hotbar only.)
 */
export function isSkillUnlocked(_character: CharacterData, _id: string): boolean {
  return false;
}
