import type { DecorTextureId, ObjectTextureId } from '../../assets/TextureKeys';

/**
 * Gameplay data for map props, kept free of rendering so collision and navigation can be checked
 * without Phaser (tests). Art (texture, origin) lives in ObstacleCatalog / the mockup factories.
 *
 *  - blocking:   solid; every footprint tile is blocked for movement
 *  - decorative: never blocks (decor ids below are flat ground details)
 *
 * A footprint is w x h tiles; the placement (col, row) is its minimum (top) corner tile and the
 * sprite stands on the footprint's centre. Single-tile props simply use 1 x 1.
 */
export type ObjectCategory = 'blocking' | 'decorative';

export interface MapObjectSpec {
  category: ObjectCategory;
  /** Footprint along +x (cols) and +y (rows). */
  w: number;
  h: number;
  /** Tall enough to hide a character standing behind it: fades like a tall wall. */
  tall?: boolean;
}

const solid = (w = 1, h = 1, tall = false): MapObjectSpec => ({ category: 'blocking', w, h, tall });

export const MAP_OBJECTS: Readonly<Record<ObjectTextureId, MapObjectSpec>> = {
  // Original Ashen Crossroads props
  rock: solid(),
  rock_small: solid(),
  dead_tree: solid(),
  pillar: solid(),
  pillar_broken: solid(),
  brazier: solid(),
  shrine: solid(),
  // Ruined city: single tile
  barrel: solid(),
  barrels: solid(),
  crate: solid(),
  crate_stack: solid(),
  rubble_heap: solid(),
  beam_pile: solid(),
  statue_broken: solid(),
  tombstone: solid(),
  fence_x: solid(),
  fence_y: solid(),
  table_broken: solid(),
  stairs_ruin: solid(),
  gate_tower: solid(1, 1, true),
  // Ruined city: multi-tile
  cart_broken: solid(2, 1),
  fallen_column: solid(2, 1),
  altar: solid(2, 1),
  rubble_mound: solid(2, 2),
  monument: solid(3, 3, true),
  bell_tower: solid(2, 2, true),
  // City wall: the whole footprint is solid (the gate is closed)
  city_gate: solid(6, 3, true),
  city_wall: solid(3, 2, true),
  city_wall_broken: solid(3, 2, true),
  city_tower: solid(2, 2, true),
};

/** Flat ground details: always walkable, drawn under characters and props. */
export const DECOR_TYPES: readonly DecorTextureId[] = ['moss', 'weeds', 'pebbles', 'debris', 'tile_shards', 'crack', 'steps'];

export function blocksMovement(type: ObjectTextureId): boolean {
  return MAP_OBJECTS[type].category === 'blocking';
}
