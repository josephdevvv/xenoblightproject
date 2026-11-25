import { fromOriginal } from '../world/maps/AshenCrossroads';
import type { MonsterId } from './MonsterDefinition';

export interface MonsterSpawnPoint {
  monster: MonsterId;
  /** Tile the monster stands in (it is placed at the tile centre). */
  col: number;
  row: number;
}

/**
 * Deterministic monster placements per map (kept separate from the map layout data). Every point is validated
 * by MonsterSpawner before anything is created; invalid points are reported and skipped, never placed. One
 * point = one monster that respawns there (MONSTER_RESPAWN_DELAY_MS), so a point is a permanent population slot.
 *
 * ashen_crossroads - 80 monsters:
 *  - 20 Void Mites, only in Zone 1 (rows 90-119, the original Ashen Crossroads; written in its original
 *    coordinates and shifted with fromOriginal()).
 *  - 20 Mutant Wolves, only in Zone 2 (rows 62-89, the broken street; inside the city wall, rows 63-87).
 *  - 20 Dark Avians (flying), only in Zone 3 (rows 42-61, the ruin plaza; rows 43-60). The paved
 *    plaza is that zone's open ground and may be used; its streets and exits may not.
 *  - 20 Mutant Boars, only in Zone 4 (rows 21-41, the collapsed housing district and the pilgrim avenue). The
 *    district is dense, so a boar may stand right beside a sealed rubble building (Type B: no doorway); enterable
 *    houses keep the one-tile ring that leaves their doorways clear.
 * Every point: walkable for the monster's footprint, not on a road (Zone 3: not on a street or exit, nor next
 * to one), not in or right beside a building (its doorway stays clear), one tile in from the map edge, at least
 * 4 tiles from the next monster, and at least 8 tiles - straight and walking - from the player spawn and every
 * NPC (Mateus, Roland, Jack, Sonny). Checked by tests/monsterSpawns.test.ts.
 */
export const MONSTER_SPAWNS: Readonly<Record<string, readonly MonsterSpawnPoint[]>> = {
  ashen_crossroads: [
    { monster: 'voidmite', ...fromOriginal({ col: 5, row: 4 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 11, row: 3 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 19, row: 2 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 27, row: 5 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 4, row: 13 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 27, row: 17 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 6, row: 20 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 24, row: 22 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 1, row: 28 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 21, row: 11 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 28, row: 28 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 28, row: 11 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 22, row: 28 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 16, row: 7 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 1, row: 8 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 8, row: 9 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 1, row: 18 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 6, row: 26 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 22, row: 16 }) },
    { monster: 'voidmite', ...fromOriginal({ col: 1, row: 1 }) },
    { monster: 'mutant_wolf', col: 2, row: 68 },
    { monster: 'mutant_wolf', col: 25, row: 63 },
    { monster: 'mutant_wolf', col: 20, row: 86 },
    { monster: 'mutant_wolf', col: 1, row: 86 },
    { monster: 'mutant_wolf', col: 28, row: 76 },
    { monster: 'mutant_wolf', col: 16, row: 69 },
    { monster: 'mutant_wolf', col: 19, row: 77 },
    { monster: 'mutant_wolf', col: 28, row: 85 },
    { monster: 'mutant_wolf', col: 9, row: 65 },
    { monster: 'mutant_wolf', col: 24, row: 70 },
    { monster: 'mutant_wolf', col: 7, row: 85 },
    { monster: 'mutant_wolf', col: 16, row: 63 },
    { monster: 'mutant_wolf', col: 4, row: 63 },
    { monster: 'mutant_wolf', col: 28, row: 67 },
    { monster: 'mutant_wolf', col: 16, row: 83 },
    { monster: 'mutant_wolf', col: 7, row: 69 },
    { monster: 'mutant_wolf', col: 24, row: 83 },
    { monster: 'mutant_wolf', col: 22, row: 66 },
    { monster: 'mutant_wolf', col: 24, row: 75 },
    { monster: 'mutant_wolf', col: 28, row: 71 },
    { monster: 'dark_avian', col: 12, row: 43 },
    { monster: 'dark_avian', col: 28, row: 46 },
    { monster: 'dark_avian', col: 1, row: 50 },
    { monster: 'dark_avian', col: 18, row: 52 },
    { monster: 'dark_avian', col: 9, row: 55 },
    { monster: 'dark_avian', col: 28, row: 55 },
    { monster: 'dark_avian', col: 20, row: 44 },
    { monster: 'dark_avian', col: 4, row: 43 },
    { monster: 'dark_avian', col: 8, row: 48 },
    { monster: 'dark_avian', col: 21, row: 58 },
    { monster: 'dark_avian', col: 2, row: 56 },
    { monster: 'dark_avian', col: 23, row: 49 },
    { monster: 'dark_avian', col: 15, row: 57 },
    { monster: 'dark_avian', col: 14, row: 48 },
    { monster: 'dark_avian', col: 5, row: 52 },
    { monster: 'dark_avian', col: 13, row: 53 },
    { monster: 'dark_avian', col: 23, row: 54 },
    { monster: 'dark_avian', col: 25, row: 43 },
    { monster: 'dark_avian', col: 28, row: 60 },
    { monster: 'dark_avian', col: 19, row: 48 },
    { monster: 'mutant_boar', col: 24, row: 21 },
    { monster: 'mutant_boar', col: 7, row: 22 },
    { monster: 'mutant_boar', col: 28, row: 22 },
    { monster: 'mutant_boar', col: 19, row: 23 },
    { monster: 'mutant_boar', col: 24, row: 25 },
    { monster: 'mutant_boar', col: 13, row: 27 },
    { monster: 'mutant_boar', col: 28, row: 28 },
    { monster: 'mutant_boar', col: 24, row: 29 },
    { monster: 'mutant_boar', col: 7, row: 31 },
    { monster: 'mutant_boar', col: 1, row: 32 },
    { monster: 'mutant_boar', col: 20, row: 32 },
    { monster: 'mutant_boar', col: 27, row: 34 },
    { monster: 'mutant_boar', col: 7, row: 35 },
    { monster: 'mutant_boar', col: 12, row: 36 },
    { monster: 'mutant_boar', col: 20, row: 37 },
    { monster: 'mutant_boar', col: 24, row: 39 },
    { monster: 'mutant_boar', col: 28, row: 39 },
    { monster: 'mutant_boar', col: 1, row: 40 },
    { monster: 'mutant_boar', col: 7, row: 40 },
    { monster: 'mutant_boar', col: 16, row: 40 },
  ],
};
