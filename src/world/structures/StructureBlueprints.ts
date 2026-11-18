/**
 * Walk-in structures are assembled from thin wall pieces that run along tile EDGES, plus corner posts.
 * Each piece is its own sprite with its own collision box, so characters can walk inside a building,
 * behind its walls and through gaps, and depth sorting stays correct (see StructureLayer).
 *
 * Local coordinates: the footprint covers [0, width] x [0, height] in tile space.
 *  - 'x' walls run along +x at a constant y (back wall y = 0, front wall y = height)
 *  - 'y' walls run along +y at a constant x (back wall x = 0, front wall x = width)
 * Back walls (y = 0, x = 0) stand tall; front walls are ruined low so the interior stays visible.
 */

export type StructureType = 'ruined_house';

export type WallOrientation = 'x' | 'y';

/** Visual + height variants (art generated in MockupStructureFactory). */
export type WallVariant =
  | 'tall_plain'
  | 'tall_window'
  | 'tall_gable'
  | 'tall_broken'
  | 'mid_broken'
  | 'low_broken'
  | 'low_rubble';

export type PostVariant = 'chimney' | 'post_tall' | 'post_mid' | 'post_low';

export type DecalVariant = 'rubble' | 'rubble_small' | 'fallen_beam';

export interface WallPieceSpec {
  orientation: WallOrientation;
  /** Start of the tile edge (local tile coords). The piece spans one tile. */
  x: number;
  y: number;
  variant: WallVariant;
}

export interface PostSpec {
  /** Corner position (local tile coords, on the footprint boundary). */
  x: number;
  y: number;
  variant: PostVariant;
}

export interface DecalSpec {
  /** Centre position (local tile coords). Decals are walkable floor clutter. */
  x: number;
  y: number;
  variant: DecalVariant;
}

export interface StructureBlueprint {
  width: number;
  height: number;
  /** Wall thickness in tiles (walls are inset into the footprint). */
  wallThickness: number;
  walls: WallPieceSpec[];
  posts: PostSpec[];
  decals: DecalSpec[];
}

export const STRUCTURE_BLUEPRINTS: Readonly<Record<StructureType, StructureBlueprint>> = {
  /** Burnt-out medieval townhouse: stone ground floor, half-timbered upper walls, collapsed roof. */
  ruined_house: {
    width: 3,
    height: 3,
    wallThickness: 0.22,
    walls: [
      // Back-right wall (NE on screen)
      { orientation: 'x', x: 0, y: 0, variant: 'tall_window' },
      { orientation: 'x', x: 1, y: 0, variant: 'tall_gable' },
      { orientation: 'x', x: 2, y: 0, variant: 'tall_broken' },
      // Back-left wall (NW on screen)
      { orientation: 'y', x: 0, y: 0, variant: 'tall_plain' },
      { orientation: 'y', x: 0, y: 1, variant: 'tall_window' },
      { orientation: 'y', x: 0, y: 2, variant: 'mid_broken' },
      // Front-left wall (SW on screen) - doorway in the middle
      { orientation: 'x', x: 0, y: 3, variant: 'low_broken' },
      { orientation: 'x', x: 2, y: 3, variant: 'low_rubble' },
      // Front-right wall (SE on screen) - collapsed gap in the middle
      { orientation: 'y', x: 3, y: 0, variant: 'mid_broken' },
      { orientation: 'y', x: 3, y: 2, variant: 'low_broken' },
    ],
    posts: [
      { x: 0, y: 0, variant: 'chimney' },
      { x: 3, y: 0, variant: 'post_tall' },
      { x: 0, y: 3, variant: 'post_mid' },
      { x: 3, y: 3, variant: 'post_low' },
    ],
    decals: [
      { x: 1.5, y: 3.25, variant: 'rubble_small' },
      { x: 3.2, y: 1.5, variant: 'rubble' },
      { x: 1.1, y: 1.0, variant: 'fallen_beam' },
      { x: 2.2, y: 2.1, variant: 'rubble_small' },
      { x: 0.7, y: 2.3, variant: 'rubble' },
    ],
  },
};
