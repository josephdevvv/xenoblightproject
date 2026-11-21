import type { DerivedStats } from '../status/DerivedStats';

/**
 * Early-game combat rules: one place for every number, so balancing is data, not code.
 * Player values come straight from the existing derived stats (DerivedStats); monster values live in
 * MonsterDefinition.combat. Pure functions only (unit-tested, no Phaser).
 */

/** What any combatant brings to an exchange of blows. */
export interface CombatStats {
  maxHp: number;
  atk: number;
  def: number;
  hit: number;
  flee: number;
  /** % chance. */
  critRate: number;
  /** % of normal damage. */
  critDamage: number;
  /** Time between basic attacks. */
  attackIntervalMs: number;
  /** Centre-to-centre reach of a basic attack (tiles). */
  attackRange: number;
}

export const COMBAT_RULES = {
  /** Player basic attack interval before Attack Speed bonus (Attack Speed % shortens it). */
  playerBaseAttackIntervalMs: 1200,
  /** Unarmed / starter melee reach. */
  playerAttackRange: 1.25,
  /** hit % = base + HIT - FLEE, clamped. */
  hitChanceBase: 75,
  hitChanceMin: 5,
  hitChanceMax: 95,
  /** Every landed hit does at least this much. */
  minDamage: 1,
  /** Player HP regeneration out of combat (fraction of max HP per second) and the calm time before it starts. */
  regenPerSecond: 0.015,
  regenDelayMs: 4000,
} as const;

/** The player's combat numbers from the existing derived stats (melee: the Drifter fights in melee). */
export function playerCombatStats(d: DerivedStats): CombatStats {
  return {
    maxHp: Math.round(d.maxHp),
    atk: d.meleeAtk,
    def: d.def,
    hit: d.hit,
    flee: d.flee,
    critRate: d.critRate,
    critDamage: d.critDamage,
    attackIntervalMs: Math.round(COMBAT_RULES.playerBaseAttackIntervalMs / (1 + d.attackSpeedBonus / 100)),
    attackRange: COMBAT_RULES.playerAttackRange,
  };
}

export interface AttackResult {
  hit: boolean;
  crit: boolean;
  damage: number;
}

/** Chance (%) that `attacker` lands a normal hit on `defender`. */
export function hitChance(attacker: Pick<CombatStats, 'hit'>, defender: Pick<CombatStats, 'flee'>): number {
  return Math.min(COMBAT_RULES.hitChanceMax, Math.max(COMBAT_RULES.hitChanceMin, COMBAT_RULES.hitChanceBase + attacker.hit - defender.flee));
}

/** Damage of a landed normal (non-critical) hit: ATK - DEF, at least the minimum. */
export function normalDamage(attacker: Pick<CombatStats, 'atk'>, defender: Pick<CombatStats, 'def'>): number {
  return Math.max(COMBAT_RULES.minDamage, Math.floor(attacker.atk - defender.def));
}

/** Normal hits needed to bring `maxHp` to 0 (no crits, no misses counted). */
export function hitsToKill(attacker: Pick<CombatStats, 'atk'>, defender: Pick<CombatStats, 'def' | 'maxHp'>): number {
  return Math.ceil(defender.maxHp / normalDamage(attacker, defender));
}

/**
 * One basic attack. `roll()` returns [0, 1). A critical hit cannot miss and deals critDamage %;
 * otherwise the hit chance decides, and a landed hit deals the normal damage.
 */
export function rollAttack(attacker: CombatStats, defender: CombatStats, roll: () => number): AttackResult {
  if (roll() * 100 < attacker.critRate) {
    return { hit: true, crit: true, damage: Math.max(COMBAT_RULES.minDamage, Math.floor((normalDamage(attacker, defender) * attacker.critDamage) / 100)) };
  }
  if (roll() * 100 >= hitChance(attacker, defender)) return { hit: false, crit: false, damage: 0 };
  return { hit: true, crit: false, damage: normalDamage(attacker, defender) };
}

// ------------------------------------------------------------------------------------------------
// Experience
// ------------------------------------------------------------------------------------------------

/** EXP needed to go from `level` to `level + 1` (25 * L^1.5: 25, 71, 130, 200, 280, ... 675 at L9). */
export function expToNextLevel(level: number): number {
  return Math.round(25 * Math.pow(level, 1.5));
}

/** Adds EXP; returns the new level / remaining EXP (several level-ups at once are possible). */
export function addExp(level: number, exp: number, gained: number, maxLevel: number): { level: number; exp: number; levelsGained: number } {
  let l = level;
  let e = exp + Math.max(0, Math.floor(gained));
  let gainedLevels = 0;
  while (l < maxLevel && e >= expToNextLevel(l)) {
    e -= expToNextLevel(l);
    l++;
    gainedLevels++;
  }
  if (l >= maxLevel) e = 0;
  return { level: l, exp: e, levelsGained: gainedLevels };
}
