import type { CombatStats } from '../combat/CombatRules';
import type { MonsterArtId } from './art/MonsterArt';

/**
 * Data describing a monster type: art, movement and combat balance. All balancing lives in `combat`
 * (configurable data; the formulas are in combat/CombatRules.ts and use the same stat names as players).
 */

export type MonsterId = 'voidmite' | 'mutant_wolf' | 'dark_avian' | 'mutant_boar';

/**
 * A flying monster's body is drawn above its ground point: movement, collision, pathfinding, depth and the
 * target ring stay on the ground; only the sprite is lifted (a small shadow marks the ground point).
 */
export interface MonsterFlight {
  /** Height of the body above the ground (native px). */
  heightPx: number;
  /** Gentle bobbing: up to this many px up and down around the height, whole pixels only. */
  bobPx: number;
  bobPeriodMs: number;
}

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
  /** Flying monsters only. */
  flight?: MonsterFlight;
  combat: MonsterCombatDefinition;
}

/**
 * Every monster comes back this long after its death (one shared rule), at its own spawn point - the same
 * monster, never a second one, so a map's population stays exactly its spawn table.
 */
export const MONSTER_RESPAWN_DELAY_MS = 5000;

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
      respawnMs: MONSTER_RESPAWN_DELAY_MS,
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
      respawnMs: MONSTER_RESPAWN_DELAY_MS,
    },
  },
  dark_avian: {
    id: 'dark_avian',
    displayName: 'Dark Avian',
    category: 'monster',
    art: 'dark_avian',
    footprintRadius: 0.32,
    behavior: { type: 'wander', radiusTiles: 3, speed: 1.4, pauseMs: [1200, 3200] },
    flight: { heightPx: 32, bobPx: 2, bobPeriodMs: 1600 },
    // Zone 3 monster, balanced on the Mutant Wolf: HP and ATK x1.7 (45 -> 77, 23 -> 39, rounded). The rest is
    // set, not multiplied: HIT stays 200 (the hit chance caps at 95 % anyway), a little more DEF and FLEE
    // (harder to hit in the air), slower heavier dives (2.2 s), slightly longer reach, chase and leash.
    combat: {
      level: 5,
      maxHp: 77,
      atk: 39,
      def: 3,
      hit: 200,
      flee: 95,
      attackIntervalMs: 2200,
      attackRange: 1.2,
      chaseSpeed: 2.6,
      leashTiles: 10,
      respawnMs: MONSTER_RESPAWN_DELAY_MS,
    },
  },
  mutant_boar: {
    id: 'mutant_boar',
    displayName: 'Mutant Boar',
    category: 'monster',
    art: 'mutant_boar',
    // Zone 4 ground monster on the Mutant Wolf's rules: same footprint (collision), wandering and AI numbers.
    footprintRadius: 0.35,
    behavior: { type: 'wander', radiusTiles: 3, speed: 1.3, pauseMs: [1400, 3600] },
    // Level, Max HP, ATK and HIT as specified; DEF, FLEE, attack speed, reach, chase and leash are the wolf's.
    combat: {
      level: 7,
      maxHp: 100,
      atk: 42,
      def: 2,
      hit: 150,
      flee: 85,
      attackIntervalMs: 1900,
      attackRange: 1.1,
      chaseSpeed: 2.4,
      leashTiles: 9,
      respawnMs: MONSTER_RESPAWN_DELAY_MS,
    },
  },
};

/** A monster's numbers in the shape the combat rules use (monsters do not crit). */
export function monsterCombatStats(def: MonsterDefinition): CombatStats {
  const c = def.combat;
  return { maxHp: c.maxHp, atk: c.atk, def: c.def, hit: c.hit, flee: c.flee, critRate: 0, critDamage: 100, attackIntervalMs: c.attackIntervalMs, attackRange: c.attackRange };
}
