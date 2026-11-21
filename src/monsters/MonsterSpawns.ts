import { fromOriginal } from '../world/maps/AshenCrossroads';
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
 * ashen_crossroads: 10 Voidmites in the starting area (the original 30x30 map, now rows 90-119 of the
 * expanded city) - written in the original coordinates and shifted with fromOriginal(), so they keep
 * their places relative to the props, the shrine plaza, the ruined house and the player spawn.
 * Mutant Wolves (visual entry, idle wandering only) roam the ruined city: the broken street, the plaza
 * and the pilgrim avenue - away from the starting area. No encounters or combat in this milestone.
 */
export const MONSTER_SPAWNS: Readonly<Record<string, readonly MonsterSpawnPoint[]>> = {
  ashen_crossroads: [
    { monster: 'voidmite', ...fromOriginal({ col: 5, row: 4 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 11, row: 3 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 19, row: 2 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 27, row: 5 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 4, row: 13 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 20, row: 11 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 27, row: 17 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 6, row: 20 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 24, row: 22 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 17, row: 26 }) },
    { monster: 'mutant_wolf', col: 2, row: 68 },
    { monster: 'mutant_wolf', col: 25, row: 63 },
    { monster: 'mutant_wolf', col: 21, row: 51 },
    { monster: 'mutant_wolf', col: 27, row: 33 },
  ],
};
