/**
 * Global, engine-agnostic constants shared across the game.
 */

/** Logical game viewport (the canvas is scaled to fit the browser while keeping this ratio). */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 480;

/** Isometric diamond tile footprint in pixels (2:1 ratio). */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const TILE_HALF_WIDTH = TILE_WIDTH / 2;
export const TILE_HALF_HEIGHT = TILE_HEIGHT / 2;

/** Height of the earth "side" painted under each diamond (only visible along map edges). */
export const TILE_SIDE_HEIGHT = 8;

/**
 * Mockup art is painted at half resolution and upscaled x2 with nearest-neighbour sampling,
 * so tiles, props and characters share the same chunky pixel density.
 */
export const MOCKUP_PIXEL_SCALE = 2;

export const SCENES = {
  Boot: 'BootScene',
  CharacterCreation: 'CharacterCreationScene',
  Game: 'GameScene',
} as const;

/**
 * Render depth bands. World objects (characters, props) use their screen Y as depth,
 * which always falls between `GroundFx` and `HighFog`.
 */
export const DEPTH = {
  Ground: -300000,
  CloudShadow: -250000,
  GroundFx: -200000,
  HighFog: 150000,
  NamePlate: 160000,
  Vignette: 190000,
  Hud: 200000,
} as const;
