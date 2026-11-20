/** Texture keys for environment / FX art. Swap the generated mockups by loading files under these keys. */
export const TextureKeys = {
  groundTiles: ['tile_ground_0', 'tile_ground_1', 'tile_ground_2', 'tile_ground_3'],
  pathTiles: ['tile_path_0', 'tile_path_1', 'tile_path_2'],
  ventTile: 'tile_vent',
  /** Wooden plank floor inside buildings. */
  floorTiles: ['tile_floor_0', 'tile_floor_1'],
  /** Cobble road with missing / sunken stones (broken streets). */
  brokenCobbleTiles: ['tile_cobble_broken_0', 'tile_cobble_broken_1', 'tile_cobble_broken_2'],
  /** Large square flagstones (plazas, courtyards). */
  plazaTiles: ['tile_plaza_0', 'tile_plaza_1', 'tile_plaza_2'],
  /** Darker flagstone floor inside stone ruins and the chapel. */
  stoneFloorTiles: ['tile_stone_floor_0', 'tile_stone_floor_1'],
  /** Rubble-strewn floor of collapsed (non-enterable) buildings. */
  rubbleFloorTiles: ['tile_rubble_floor_0', 'tile_rubble_floor_1'],
  objects: {
    rock: 'obj_rock',
    rock_small: 'obj_rock_small',
    dead_tree: 'obj_dead_tree',
    pillar: 'obj_pillar',
    pillar_broken: 'obj_pillar_broken',
    brazier: 'obj_brazier',
    shrine: 'obj_shrine',
    // Ruined city props (MockupRuinFactory)
    barrel: 'obj_barrel',
    barrels: 'obj_barrels',
    crate: 'obj_crate',
    crate_stack: 'obj_crate_stack',
    rubble_heap: 'obj_rubble_heap',
    beam_pile: 'obj_beam_pile',
    statue_broken: 'obj_statue_broken',
    tombstone: 'obj_tombstone',
    fence_x: 'obj_fence_x',
    fence_y: 'obj_fence_y',
    table_broken: 'obj_table_broken',
    stairs_ruin: 'obj_stairs_ruin',
    gate_tower: 'obj_gate_tower',
    cart_broken: 'obj_cart_broken',
    fallen_column: 'obj_fallen_column',
    altar: 'obj_altar',
    rubble_mound: 'obj_rubble_mound',
    monument: 'obj_monument',
    bell_tower: 'obj_bell_tower',
    // City wall at the far end of the map (Zone 5)
    city_gate: 'obj_city_gate',
    city_wall: 'obj_city_wall',
    city_wall_broken: 'obj_city_wall_broken',
    city_tower: 'obj_city_tower',
  },
  /** Flat, walkable ground details drawn on the ground layer. */
  decor: {
    moss: 'decor_moss',
    weeds: 'decor_weeds',
    pebbles: 'decor_pebbles',
    debris: 'decor_debris',
    tile_shards: 'decor_tile_shards',
    crack: 'decor_crack',
    steps: 'decor_steps',
  },
  ui: {
    /** Original logo file as loaded (not displayed directly). */
    logoSource: 'ui_logo_source',
  },
  fx: {
    fog: 'fx_fog',
    cloud: 'fx_cloud',
    smoke: 'fx_smoke',
    glow: 'fx_glow',
    vignette: 'fx_vignette',
  },
} as const;

export type ObjectTextureId = keyof typeof TextureKeys.objects;
export type DecorTextureId = keyof typeof TextureKeys.decor;
