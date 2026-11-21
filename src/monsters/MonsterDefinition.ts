import type { CombatStats } from '../combat/CombatRules';
import type { MonsterArtId } from './art/MonsterArt';

/**
 * Data describing a monster type: art, movement and combat balance. All balancing lives in `combat`
 * (configurable data; the formulas are in combat/CombatRules.ts and use the same stat names as players).
 */

export type MonsterId = 'voidmite' | 'mutant_wolf';

/** Idle wandering around the spawn point. Purely positional: no AI decisions, targets or combat. */
export interface MonsterWanderBehavior {
  type: 'wander';
  /** Maximum distance from the spawn point, in tiles. */
  radiusTiles: number;
  /** Walking speed in tiles per second. */
  speed: number;
  /** Random pause between walks, in ms [min, max]. */
  pauseMs: [number, number];
}

/** Combat balance of a monster type (see combat/CombatRules for how each number is used). */
export interface MonsterCombatDefinition extends Omit<CombatStats, 'critRate' | 'critDamage'> {
  level: number;
  /** Speed while chasing / returning home (tiles per second). */
  chaseSpeed: number;
  /** Gives up and walks home beyond this distance from its spawn point (tiles). */
  leashTiles: number;
  /** Time from death to reappearing at its spawn point. */
  respawnMs: number;
}

export interface MonsterDefinition {
  id: MonsterId;
  /** Shown under the monster (English name as delivered with the art). */
  displayName: string;
  category: 'monster';
  /** Animated sprite set (sheets, anchors, timing): see art/MonsterArt.ts. */
  art: MonsterArtId;
  /** Half-size of the square ground footprint in tiles (spawn validation and movement collision). */
  footprintRadius: number;
  /** Omit for a monster that stays where it spawned. */
  behavior?: MonsterWanderBehavior;
  combat: MonsterCombatDefinition;
}

export const MONSTER_DEFINITIONS: Readonly<Record<MonsterId, MonsterDefinition>> = {
  voidmite: {
    id: 'voidmite',
    displayName: 'Void Mite',
    category: 'monster',
    art: 'void_mite',
    footprintRadius: 0.3,
    // Slow, creepy shuffling inside a 3-tile circle around its spawn point.
    behavior: { type: 'wander', radiusTiles: 3, speed: 0.9, pauseMs: [900, 2800] },
    // Starter monster. A level-1 Drifter (ATK 7) deals 7 - 1 = 6 per normal hit: 24 HP = exactly 4 hits
    // (3 hits = 18). Bites a level-1 player for 15 - 1 = 14 at 75 + 120 - 103 = 92 %, once every 2.6 s.
    combat: {
      level: 1,
      maxHp: 24,
      atk: 15,
      def: 1,
      hit: 120,
      flee: 70,
      attackIntervalMs: 2600,
      attackRange: 0.9,
      chaseSpeed: 1.2,
      leashTiles: 7,
      respawnMs: 12000,
    },
  },
  mutant_wolf: {
    id: 'mutant_wolf',
    displayName: 'Mutant Wolf',
    category: 'monster',
    art: 'mutant_wolf',
    footprintRadius: 0.35,
    // Idle wandering like the mites, a little quicker (its walk is a light run).
    behavior: { type: 'wander', radiusTiles: 3, speed: 1.3, pauseMs: [1400, 3600] },
    // Second monster: 7 - 2 = 5 per normal hit -> 45 HP = 9 hits. Bites a level-1 player for 23 - 1 = 22
    // at the 95 % cap of the hit formula, every 1.9 s.
    combat: {
      level: 3,
      maxHp: 45,
      atk: 23,
      def: 2,
      hit: 200,
      flee: 85,
      attackIntervalMs: 1900,
      attackRange: 1.1,
      chaseSpeed: 2.4,
      leashTiles: 9,
      respawnMs: 20000,
    },
  },
};

/** A monster's numbers in the shape the combat rules use (monsters do not crit). */
export function monsterCombatStats(def: MonsterDefinition): CombatStats {
  const c = def.combat;
  return { maxHp: c.maxHp, atk: c.atk, def: c.def, hit: c.hit, flee: c.flee, critRate: 0, critDamage: 100, attackIntervalMs: c.attackIntervalMs, attackRange: c.attackRange };
}
