import type { TileCoord } from '../core/types';
import type { ObstacleType } from './ObstacleCatalog';
import type { StructureType } from './structures/StructureBlueprints';

export interface MapRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface MapObjectPlacement extends TileCoord {
  type: ObstacleType;
}

/** A multi-tile walk-in structure; (col, row) is the footprint's top (minimum) corner tile. */
export interface StructurePlacement extends TileCoord {
  type: StructureType;
}

/**
 * Data-only map description. Everything not covered by a path or vent is plain ground.
 * Later milestones can load the same shape from JSON / a map editor export.
 */
export interface MapDefinition {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Seed for picking ground tile variants. */
  seed: number;
  paths: MapRect[];
  /** Smoking ground fissures (walkable). */
  vents: TileCoord[];
  objects: MapObjectPlacement[];
  structures: StructurePlacement[];
  spawn: TileCoord;
}

/**
 * First test map: 30 x 30 tiles -> 1920 x 960 px of world, i.e. two viewports wide (960 x 480),
 * enough to exercise camera follow and boundaries without being tedious to cross.
 * A ruined shrine plaza sits at the centre with stone roads to each edge.
 */
export const TEST_MAP: MapDefinition = {
  id: 'ashen_crossroads',
  name: 'Ashen Crossroads',
  cols: 30,
  rows: 30,
  seed: 1337,
  paths: [
    { col: 11, row: 11, w: 7, h: 7 }, // central plaza
    { col: 14, row: 2, w: 1, h: 9 }, // north road
    { col: 14, row: 18, w: 1, h: 12 }, // south road (runs to the map edge / spawn)
    { col: 2, row: 14, w: 9, h: 1 }, // west road
    { col: 18, row: 14, w: 10, h: 1 }, // east road
    { col: 5, row: 5, w: 9, h: 1 }, // north-west branch
    { col: 5, row: 6, w: 1, h: 8 },
    { col: 20, row: 15, w: 1, h: 6 }, // south-east branch
    { col: 15, row: 21, w: 6, h: 1 },
    { col: 22, row: 9, w: 1, h: 5 }, // track from the east road to the ruined house door
  ],
  vents: [
    { col: 8, row: 19 },
    { col: 24, row: 23 },
    { col: 6, row: 24 },
  ],
  objects: [
    // plaza
    { type: 'pillar', col: 11, row: 11 },
    { type: 'pillar', col: 17, row: 11 },
    { type: 'pillar_broken', col: 11, row: 17 },
    { type: 'pillar', col: 17, row: 17 },
    { type: 'shrine', col: 14, row: 14 },
    { type: 'brazier', col: 12, row: 12 },
    { type: 'brazier', col: 16, row: 16 },
    // dead trees
    { type: 'dead_tree', col: 3, row: 3 },
    { type: 'dead_tree', col: 6, row: 2 },
    { type: 'dead_tree', col: 2, row: 8 },
    { type: 'dead_tree', col: 8, row: 8 },
    { type: 'dead_tree', col: 24, row: 3 },
    { type: 'dead_tree', col: 27, row: 2 },
    { type: 'dead_tree', col: 26, row: 7 },
    { type: 'dead_tree', col: 26, row: 11 },
    { type: 'dead_tree', col: 3, row: 24 },
    { type: 'dead_tree', col: 2, row: 20 },
    { type: 'dead_tree', col: 7, row: 27 },
    { type: 'dead_tree', col: 10, row: 24 },
    { type: 'dead_tree', col: 24, row: 25 },
    { type: 'dead_tree', col: 27, row: 21 },
    { type: 'dead_tree', col: 21, row: 27 },
    // rocks
    { type: 'rock', col: 9, row: 10 },
    { type: 'rock', col: 9, row: 21 },
    { type: 'rock_small', col: 22, row: 19 },
    { type: 'rock', col: 7, row: 12 },
    { type: 'rock', col: 24, row: 16 },
    { type: 'rock_small', col: 17, row: 4 },
    { type: 'rock_small', col: 12, row: 25 },
    { type: 'rock', col: 25, row: 9 },
    { type: 'rock_small', col: 3, row: 11 },
    // ruins
    { type: 'pillar_broken', col: 25, row: 13 },
    { type: 'pillar_broken', col: 4, row: 16 },
    { type: 'pillar', col: 18, row: 24 },
  ],
  structures: [
    // 3x3 footprint (192 x 96 px) centred on tile (22, 7)
    { type: 'ruined_house', col: 21, row: 6 },
  ],
  spawn: { col: 14, row: 28 },
};
