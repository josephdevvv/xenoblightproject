import type { DerivedBonusKey } from '../status/DerivedBonuses';

/**
 * Passive tree DATA (class-specific, language-free: names and texts are i18n keys built from the ids).
 * Only the Drifter tree exists. A future Class 1 tree is another PassiveTreeDefinition with its own id.
 */

/** Trees that exist now. A future class adds its id here (see PassiveProgress.changeClassTree). */
export type PassiveTreeId = 'drifter';

export type PassiveIconId =
  | 'crossed_swords'
  | 'sword'
  | 'crosshair'
  | 'impact'
  | 'shield'
  | 'heart'
  | 'medical_cross'
  | 'feather'
  | 'eye'
  | 'star';

/**
 * Skill modifiers, applied to the Drifter's skills: single-target attack skills (Power Thrust) deal more damage, HP
 * heals (Heal / Self-Heal) restore more (PassiveProgress modifiedSkillDamage / modifiedHealPercent).
 */
export type SkillModifierId = 'singleTargetSkillDamagePercent' | 'healPercent';

/** What ONE rank gives. */
export type PassiveEffect =
  | { kind: 'flat'; stat: DerivedBonusKey; amount: number }
  | { kind: 'maxHpPercent'; amount: number }
  | { kind: 'skill'; modifier: SkillModifierId; amount: number };

export type PassiveBranch = 'center' | 'left' | 'right' | 'down';

export interface PassiveNodeDefinition {
  id: string;
  icon: PassiveIconId;
  maxRank: number;
  branch: PassiveBranch;
  /** 0 = center, 1..3 = outward along the branch. */
  step: number;
  /** Node that needs at least rank 1 first (null = the center). */
  requires: string | null;
  /** Effect of each rank (summed per rank). */
  effects: readonly PassiveEffect[];
}

export interface PassiveTreeDefinition {
  id: PassiveTreeId;
  /** Mandatory center node: the first point must go here. */
  centerId: string;
  nodes: readonly PassiveNodeDefinition[];
  /** Points granted: one per level from 1 up to this level. */
  levelRewardsUntil: number;
}

const flat = (stat: DerivedBonusKey, amount: number): PassiveEffect => ({ kind: 'flat', stat, amount });

export const DRIFTER_TREE: PassiveTreeDefinition = {
  id: 'drifter',
  centerId: 'drifters_resolve',
  levelRewardsUntil: 10,
  nodes: [
    { id: 'drifters_resolve', icon: 'crossed_swords', maxRank: 1, branch: 'center', step: 0, requires: null, effects: [flat('meleeAtk', 3), flat('maxHp', 5)] },
    // left: offence
    { id: 'combat_training', icon: 'sword', maxRank: 2, branch: 'left', step: 1, requires: 'drifters_resolve', effects: [flat('meleeAtk', 3)] },
    { id: 'precision', icon: 'crosshair', maxRank: 2, branch: 'left', step: 2, requires: 'combat_training', effects: [flat('hit', 5)] },
    { id: 'power_strike', icon: 'impact', maxRank: 2, branch: 'left', step: 3, requires: 'precision', effects: [{ kind: 'skill', modifier: 'singleTargetSkillDamagePercent', amount: 5 }] },
    // right: defence
    { id: 'basic_guard', icon: 'shield', maxRank: 2, branch: 'right', step: 1, requires: 'drifters_resolve', effects: [flat('def', 3), flat('mdef', 3)] },
    { id: 'vitality', icon: 'heart', maxRank: 2, branch: 'right', step: 2, requires: 'basic_guard', effects: [{ kind: 'maxHpPercent', amount: 5 }] },
    { id: 'recovery', icon: 'medical_cross', maxRank: 2, branch: 'right', step: 3, requires: 'vitality', effects: [{ kind: 'skill', modifier: 'healPercent', amount: 10 }] },
    // down: mobility
    { id: 'swiftness', icon: 'feather', maxRank: 2, branch: 'down', step: 1, requires: 'drifters_resolve', effects: [flat('aspdPercent', 2)] }, // ASPD +2 % per rank
    { id: 'evasion', icon: 'eye', maxRank: 2, branch: 'down', step: 2, requires: 'swiftness', effects: [flat('flee', 4)] },
    { id: 'opportunity', icon: 'star', maxRank: 2, branch: 'down', step: 3, requires: 'evasion', effects: [flat('critRate', 1)] },
  ],
};

export const PASSIVE_TREES: Readonly<Record<PassiveTreeId, PassiveTreeDefinition>> = {
  drifter: DRIFTER_TREE,
};

export function passiveNode(tree: PassiveTreeDefinition, id: string): PassiveNodeDefinition | undefined {
  return tree.nodes.find((n) => n.id === id);
}

/** Passive points a tree's level rewards have granted at `level` (Drifter: 1 per level 1..10). */
export function levelRewardPoints(tree: PassiveTreeDefinition, level: number): number {
  return Math.max(0, Math.min(Math.floor(level), tree.levelRewardsUntil));
}

/**
 * Points a NEW class tree receives once when the character changes class (future Class 1 change).
 * Not reachable yet: no class change exists.
 */
export const CLASS_CHANGE_PASSIVE_POINTS = 10;
