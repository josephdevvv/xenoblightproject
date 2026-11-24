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
 *
 * The footprint is reserved (nothing else is placed on it) and, by default, solid. A building whose art has walkable
 * ground baked in around it (a stone slab, a front yard) gives its `ground` collision instead: only the walls' base and
 * the solid extras block movement, the rest of the lot is walkable.
 */
export type ObjectCategory = 'blocking' | 'decorative';

export interface MapObjectSpec {
  category: ObjectCategory;
  /** Footprint along +x (cols) and +y (rows). */
  w: number;
  h: number;
  /** Tall enough to hide a character standing behind it: fades like a tall wall. */
  tall?: boolean;
  /** Ground-level collision (tile offsets inside the footprint, fractions allowed); default: the whole footprint. */
  ground?: GroundCollision;
}

/** A box in tile offsets from the footprint's minimum corner. */
export interface LocalBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GroundCollision {
  /** The walls' base: solid, and the box the sprite depth-sorts and fades by. */
  walls: LocalBox;
  /** Further solid spots baked into the art (boulders). */
  extra?: readonly LocalBox[];
}

const solid = (w = 1, h = 1, tall = false): MapObjectSpec => ({ category: 'blocking', w, h, tall });
/** A building on a walkable lot: only `ground` blocks (measured on the art - see DawnkeepArt). */
const onLot = (w: number, h: number, ground: GroundCollision): MapObjectSpec => ({ ...solid(w, h, true), ground });

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
  // the same wall pieces running along +y (rows)
  city_wall_y: solid(2, 3, true),
  city_wall_broken_y: solid(2, 3, true),
  // Dawnkeep: the citadel, the gate, the church, houses and props
  dk_keep: solid(4, 4, true),
  dk_castle_tower: solid(2, 2, true),
  dk_gate_tower: solid(2, 2, true),
  dk_church: solid(4, 6, true),
  dk_house_intact: onLot(4, 4, { walls: { x: 0, y: 0, w: 3.9, h: 3.9 } }),
  // the burned house on its stone slab; boulders left, right and in front of the right wall
  dk_ruin_burned: onLot(6, 6, {
    walls: { x: 0, y: 0, w: 4.45, h: 4.45 },
    extra: [
      { x: 0.15, y: 4.1, w: 1, h: 0.9 },
      { x: 4.35, y: 0.1, w: 1.2, h: 1.8 },
      { x: 4.55, y: 3.4, w: 0.85, h: 0.9 },
    ],
  }),
  // the cottage at the back of its front yard
  dk_ruin_cottage: onLot(5, 5, { walls: { x: 0, y: 0, w: 3.55, h: 2.75 } }),
  dk_ruin_shell: solid(5, 5, true),
  // only the stall's stone base collides (crates, posts, the drape; it is offset from the 2 x 1 footprint); it never
  // fades - the open canopy hides little, and its image is mostly empty air
  dk_market_stall: { ...solid(2, 1), ground: { walls: { x: 0.42, y: -0.09, w: 1.41, h: 1.3 } } },
  dk_well: solid(),
  dk_barricade: solid(2, 1),
  dk_banner: solid(1, 1, true),
  dk_knight_statue: solid(1, 1, true),
};

/** Flat ground details: always walkable, drawn under characters and props. */
export const DECOR_TYPES: readonly DecorTextureId[] = ['moss', 'weeds', 'pebbles', 'debris', 'tile_shards', 'crack', 'steps'];

export function blocksMovement(type: ObjectTextureId): boolean {
  return MAP_OBJECTS[type].category === 'blocking';
}
