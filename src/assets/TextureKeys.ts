/** Texture keys for environment / FX art. Swap the generated mockups by loading files under these keys. */
export const TextureKeys = {
  groundTiles: ['tile_ground_0', 'tile_ground_1', 'tile_ground_2', 'tile_ground_3'],
  pathTiles: ['tile_path_0', 'tile_path_1', 'tile_path_2'],
  ventTile: 'tile_vent',
  /** Wooden plank floor inside buildings. */
  floorTiles: ['tile_floor_0', 'tile_floor_1'],
  objects: {
    rock: 'obj_rock',
    rock_small: 'obj_rock_small',
    dead_tree: 'obj_dead_tree',
    pillar: 'obj_pillar',
    pillar_broken: 'obj_pillar_broken',
    brazier: 'obj_brazier',
    shrine: 'obj_shrine',
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
