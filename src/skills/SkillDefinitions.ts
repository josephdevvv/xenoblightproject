import { PLAYER_ATTACKS, type PlayerAttackId } from '../combat/PlayerAttacks';
import { modifiedHealPercent, type SkillModifiers } from '../passives/PassiveProgress';
import type { PassiveIconId, SkillModifierId } from '../passives/PassiveTree';

/**
 * Active skills - data only (no Phaser), unit-tested. Every skill is LOCKED until its skill scroll is used
 * (SkillService); unlocked skills are used through the hotbar only (keys 1-8), never a fixed key.
 *
 *  - drifter_lv1 "Power Thrust": the existing Lv.1 attack (PLAYER_ATTACKS.drifter_lv1 - dagger_thrust, 200 % ATK,
 *    impact VFX on the global hit frame) as the next swing on the current target; 5 SP, 3 s cooldown.
 *  - drifter_heal "Heal": restores 30 % of max HP to the player, 15 SP, 30 s cooldown, the self_heal_cast clip.
 * SP is paid and the cooldown starts only when the skill really goes off (the swing / the cast).
 *
 * Icons reuse the approved Drifter passive icon sheet (the passive of each skill: Power Strike, Recovery).
 */
export type SkillId = 'drifter_lv1' | 'drifter_heal';

interface SkillBase {
  id: SkillId;
  /** Class whose Skill window lists it. */
  classId: 'drifter';
  /** The skill scroll that teaches it. */
  scrollItemId: string;
  cooldownMs: number;
  /** SP paid when it goes off; it cannot be used with less SP. */
  spCost: number;
  icon: PassiveIconId;
}

export type SkillDefinition =
  | (SkillBase & { kind: 'attack'; attackId: Exclude<PlayerAttackId, 'basic'> })
  | (SkillBase & { kind: 'heal'; healPercentMaxHp: number });

export const SKILL_DEFINITIONS: Readonly<Record<SkillId, SkillDefinition>> = {
  drifter_lv1: { id: 'drifter_lv1', classId: 'drifter', kind: 'attack', attackId: 'drifter_lv1', scrollItemId: 'scroll_power_thrust', cooldownMs: 3_000, spCost: 5, icon: 'impact' },
  drifter_heal: { id: 'drifter_heal', classId: 'drifter', kind: 'heal', healPercentMaxHp: 30, scrollItemId: 'scroll_heal', cooldownMs: 30_000, spCost: 15, icon: 'medical_cross' },
};

/** The Drifter's Skill window, in this order. */
export const DRIFTER_SKILLS: readonly SkillId[] = ['drifter_lv1', 'drifter_heal'];

export const SKILL_IDS = Object.keys(SKILL_DEFINITIONS) as SkillId[];

export function isSkillId(id: unknown): id is SkillId {
  return typeof id === 'string' && (SKILL_IDS as readonly string[]).includes(id);
}

/** Damage of an attack skill in % of ATK (from the attack's own multiplier - one number, not two). */
export function skillAtkPercent(def: SkillDefinition): number | null {
  return def.kind === 'attack' ? Math.round(PLAYER_ATTACKS[def.attackId].atkMultiplier * 100) : null;
}

/** Target-required skills go through target-select mode (cursor + click); self skills (Heal) are cast at once. */
export function needsTarget(def: SkillDefinition): boolean {
  return def.kind === 'attack';
}

/** % of Max HP a heal restores: its own value x (1 + the Recovery passive %) - 30 -> 33 / 36 at Recovery 1 / 2. */
export function skillHealPercent(def: SkillDefinition, mods?: SkillModifiers): number {
  if (def.kind !== 'heal') return 0;
  return mods ? modifiedHealPercent(def.healPercentMaxHp, mods) : def.healPercentMaxHp;
}

/** HP a heal restores for this max HP (whole points), with the Recovery passive's bonus. */
export function skillHealAmount(def: SkillDefinition, maxHp: number, mods?: SkillModifiers): number {
  return def.kind === 'heal' ? Math.round((maxHp * skillHealPercent(def, mods)) / 100) : 0;
}


/** The skills a passive skill modifier acts on (the Passive Tree names them in its descriptions). */
export function skillsAffectedBy(modifier: SkillModifierId): SkillId[] {
  const kind = modifier === 'healPercent' ? 'heal' : 'attack';
  return SKILL_IDS.filter((id) => SKILL_DEFINITIONS[id].kind === kind);
}
