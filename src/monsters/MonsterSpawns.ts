import type { MonsterId } from './MonsterDefinition';

export interface MonsterSpawnPoint {
  monster: MonsterId;
  /** Tile the monster stands in (it is placed at the tile centre). */
  col: number;
  row: number;
}

/**
 * Deterministic monster placements per map (kept separate from the map layout data).
 * Every point is validated by MonsterSpawner before anything is created; invalid points are
 * reported and skipped, never placed.
 *
 * ashen_crossroads (30x30): 10 Voidmites spread over the four quarters, the north/south roads and
 * the east side - clear of props, the shrine plaza, the ruined house and the player spawn (14,28).
 */
export const MONSTER_SPAWNS: Readonly<Record<string, readonly MonsterSpawnPoint[]>> = {
  ashen_crossroads: [
    { monster: 'voidmite', col: 5, row: 4 },
    { monster: 'voidmite', col: 11, row: 3 },
    { monster: 'voidmite', col: 19, row: 2 },
    { monster: 'voidmite', col: 27, row: 5 },
    { monster: 'voidmite', col: 4, row: 13 },
    { monster: 'voidmite', col: 20, row: 11 },
    { monster: 'voidmite', col: 27, row: 17 },
    { monster: 'voidmite', col: 6, row: 20 },
    { monster: 'voidmite', col: 24, row: 22 },
    { monster: 'voidmite', col: 17, row: 26 },
  ],
};
