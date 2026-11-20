import type { ObjectTextureId } from '../../assets/TextureKeys';

/**
 * Walk-in structures are assembled from thin wall pieces that run along tile EDGES, plus corner posts.
 * Each piece is its own sprite with its own collision box, so characters can walk inside a building,
 * behind its walls and through gaps, and depth sorting stays correct (see StructureLayer).
 *
 * Local coordinates: the footprint covers [0, width] x [0, height] in tile space.
 *  - 'x' walls run along +x at a constant y (back wall y = 0, front wall y = height)
 *  - 'y' walls run along +y at a constant x (back wall x = 0, front wall x = width)
 *  - walls at other x / y are interior partitions
 * Back walls (y = 0, x = 0) stand tall; front walls are ruined low so the interior stays visible.
 *
 * Two kinds of building:
 *  - enterable (Type A): open doorways / collapsed wall gaps, walkable floor inside
 *  - collapsed (Type B): closed walls and an interior completely filled with rubble props, so the
 *    whole footprint is blocked and nothing suggests a way in
 */

export type StructureType =
  | 'ruined_house'
  | 'stone_house'
  | 'stone_house_b'
  | 'stone_hall'
  | 'timber_house'
  | 'courtyard'
  | 'collapsed_house'
  | 'collapsed_hall'
  | 'chapel';

export type WallOrientation = 'x' | 'y';

/** Visual + height variants (art generated in MockupStructureFactory). */
export type WallVariant =
  // half-timbered townhouse
  | 'tall_plain'
  | 'tall_window'
  | 'tall_gable'
  | 'tall_broken'
  | 'mid_broken'
  | 'low_broken'
  | 'low_rubble'
  // all-stone houses and city walls
  | 'stone_tall'
  | 'stone_window'
  | 'stone_mid'
  | 'stone_low'
  | 'stone_ruin'
  // chapel (Gothic)
  | 'gothic_tall'
  | 'gothic_lancet'
  | 'gothic_broken'
  // open arches: drawn, but never block movement
  | 'arch_open'
  | 'arch_broken';

/** Wall variants a character can walk through (the opening fills the whole piece). */
export const OPEN_WALL_VARIANTS: ReadonlySet<WallVariant> = new Set<WallVariant>(['arch_open', 'arch_broken']);

export type PostVariant =
  | 'chimney'
  | 'post_tall'
  | 'post_mid'
  | 'post_low'
  | 'stone_post_tall'
  | 'stone_post_mid'
  | 'stone_post_low'
  | 'buttress';

export type DecalVariant = 'rubble' | 'rubble_small' | 'fallen_beam';

/** Floor tiles inside the footprint. */
export type FloorType = 'wood' | 'stone' | 'rubble';

export interface WallPieceSpec {
  orientation: WallOrientation;
  /** Start of the tile edge (local tile coords). The piece spans one tile. */
  x: number;
  y: number;
  variant: WallVariant;
}

export interface PostSpec {
  /** Corner position (local tile coords, on a wall line). */
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

export interface PropSpec {
  /** Local tile (minimum corner of the prop's footprint). Props are solid map objects. */
  x: number;
  y: number;
  type: ObjectTextureId;
}

export interface StructureBlueprint {
  width: number;
  height: number;
  /** Wall thickness in tiles (walls are inset into the footprint). */
  wallThickness: number;
  /** Type A (true): has a way in and a walkable floor. Type B (false): sealed rubble. */
  enterable: boolean;
  floor: FloorType;
  walls: WallPieceSpec[];
  posts: PostSpec[];
  decals: DecalSpec[];
  props?: PropSpec[];
}

type Run = [WallOrientation, number, number, (WallVariant | null)[]];

/** Expands wall runs (null = gap) into one piece per tile edge. */
function walls(...runs: Run[]): WallPieceSpec[] {
  const out: WallPieceSpec[] = [];
  for (const [orientation, x, y, variants] of runs) {
    variants.forEach((variant, i) => {
      if (!variant) return;
      out.push(orientation === 'x' ? { orientation, x: x + i, y, variant } : { orientation, x, y: y + i, variant });
    });
  }
  return out;
}

const WALL = 0.22;

export const STRUCTURE_BLUEPRINTS: Readonly<Record<StructureType, StructureBlueprint>> = {
  /** Burnt-out medieval townhouse: stone ground floor, half-timbered upper walls, collapsed roof. */
  ruined_house: {
    width: 3,
    height: 3,
    wallThickness: WALL,
    enterable: true,
    floor: 'wood',
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

  /** Roofless stone house, doorway on the SE (+x) side. */
  stone_house: {
    width: 4,
    height: 3,
    wallThickness: WALL,
    enterable: true,
    floor: 'stone',
    walls: walls(
      ['x', 0, 0, ['stone_window', 'stone_tall', 'stone_ruin', 'stone_mid']],
      ['y', 0, 0, ['stone_tall', 'stone_window', 'stone_mid']],
      ['x', 0, 3, ['stone_low', 'stone_low', 'low_rubble', 'stone_mid']],
      ['y', 4, 0, ['stone_mid', null, 'stone_low']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'chimney' },
      { x: 4, y: 0, variant: 'stone_post_tall' },
      { x: 0, y: 3, variant: 'stone_post_mid' },
      { x: 4, y: 3, variant: 'stone_post_low' },
    ],
    decals: [
      { x: 2.4, y: 2.2, variant: 'rubble' },
      { x: 3.0, y: 0.8, variant: 'fallen_beam' },
      { x: 4.3, y: 1.5, variant: 'rubble_small' },
    ],
    props: [
      { x: 1, y: 0, type: 'table_broken' },
      { x: 0, y: 2, type: 'barrels' },
    ],
  },

  /** Mirror use of stone_house: doorway on the NW (x = 0) side, for houses east of a road. */
  stone_house_b: {
    width: 4,
    height: 3,
    wallThickness: WALL,
    enterable: true,
    floor: 'stone',
    walls: walls(
      ['x', 0, 0, ['stone_tall', 'stone_window', 'stone_tall', 'stone_ruin']],
      ['y', 0, 0, ['stone_tall', null, 'stone_window']],
      ['x', 0, 3, ['stone_mid', 'stone_low', 'stone_low', 'stone_mid']],
      ['y', 4, 0, ['stone_low', 'stone_mid', 'low_rubble']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'stone_post_tall' },
      { x: 4, y: 0, variant: 'chimney' },
      { x: 0, y: 3, variant: 'stone_post_mid' },
      { x: 4, y: 3, variant: 'stone_post_low' },
    ],
    decals: [
      { x: 1.4, y: 2.1, variant: 'rubble' },
      { x: 2.2, y: 0.9, variant: 'fallen_beam' },
      { x: -0.25, y: 1.5, variant: 'rubble_small' },
    ],
    props: [
      { x: 3, y: 0, type: 'crate_stack' },
      { x: 3, y: 2, type: 'table_broken' },
    ],
  },

  /** Two-room stone hall: fireplace, broken stair, doorway between the rooms. */
  stone_hall: {
    width: 5,
    height: 4,
    wallThickness: WALL,
    enterable: true,
    floor: 'stone',
    walls: walls(
      ['x', 0, 0, ['stone_tall', 'stone_window', 'stone_tall', 'stone_ruin', 'stone_mid']],
      ['y', 0, 0, ['stone_window', 'stone_tall', 'stone_tall', 'stone_ruin']],
      ['x', 0, 4, ['stone_low', 'stone_mid', 'stone_low', null, 'stone_low']],
      ['y', 5, 0, ['stone_mid', 'stone_low', null, 'stone_mid']],
      // interior partition with a doorway
      ['y', 2, 0, ['stone_mid', null, 'stone_low', 'stone_mid']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'chimney' },
      { x: 5, y: 0, variant: 'stone_post_tall' },
      { x: 0, y: 4, variant: 'stone_post_mid' },
      { x: 5, y: 4, variant: 'stone_post_low' },
    ],
    decals: [
      { x: 1.0, y: 1.6, variant: 'rubble' },
      { x: 3.6, y: 2.4, variant: 'fallen_beam' },
      { x: 4.4, y: 3.3, variant: 'rubble_small' },
      { x: 3.5, y: 4.3, variant: 'rubble_small' },
    ],
    props: [
      { x: 1, y: 0, type: 'crate_stack' },
      { x: 0, y: 3, type: 'stairs_ruin' },
      { x: 3, y: 0, type: 'table_broken' },
      { x: 4, y: 0, type: 'barrels' },
    ],
  },

  /** Half-timbered house with a broken upper storey; doorway on the SW (front) side. */
  timber_house: {
    width: 4,
    height: 4,
    wallThickness: WALL,
    enterable: true,
    floor: 'wood',
    walls: walls(
      ['x', 0, 0, ['tall_plain', 'tall_gable', 'tall_window', 'tall_broken']],
      ['y', 0, 0, ['tall_window', 'tall_plain', 'tall_broken', 'mid_broken']],
      ['x', 0, 4, ['low_broken', null, 'low_rubble', 'low_broken']],
      ['y', 4, 0, ['mid_broken', 'low_broken', 'low_rubble', 'low_broken']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'post_tall' },
      { x: 4, y: 0, variant: 'chimney' },
      { x: 0, y: 4, variant: 'post_mid' },
      { x: 4, y: 4, variant: 'post_low' },
    ],
    decals: [
      { x: 1.2, y: 1.3, variant: 'fallen_beam' },
      { x: 2.6, y: 2.5, variant: 'rubble' },
      { x: 3.4, y: 3.4, variant: 'rubble_small' },
    ],
    props: [
      { x: 0, y: 0, type: 'beam_pile' },
      { x: 3, y: 0, type: 'stairs_ruin' },
      { x: 3, y: 2, type: 'barrel' },
    ],
  },

  /** Walled yard: low broken stone walls, two openings, rubble inside. */
  courtyard: {
    width: 5,
    height: 5,
    wallThickness: WALL,
    enterable: true,
    floor: 'rubble',
    walls: walls(
      ['x', 0, 0, ['stone_mid', 'stone_ruin', 'stone_mid', 'stone_low', 'stone_mid']],
      ['y', 0, 0, ['stone_mid', 'stone_low', null, 'stone_ruin', 'stone_mid']],
      ['x', 0, 5, ['stone_low', 'stone_low', null, 'low_rubble', 'stone_low']],
      ['y', 5, 0, ['stone_low', 'stone_mid', 'stone_low', 'low_rubble', 'stone_low']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'stone_post_mid' },
      { x: 5, y: 0, variant: 'stone_post_mid' },
      { x: 0, y: 5, variant: 'stone_post_low' },
      { x: 5, y: 5, variant: 'stone_post_low' },
    ],
    decals: [
      { x: 1.3, y: 1.4, variant: 'rubble' },
      { x: 3.4, y: 2.6, variant: 'rubble_small' },
      { x: 2.2, y: 3.8, variant: 'fallen_beam' },
    ],
    props: [
      { x: 3, y: 1, type: 'rubble_heap' },
      { x: 1, y: 3, type: 'crate' },
    ],
  },

  /** Type B: stone house caved in - closed walls, interior filled with rubble. */
  collapsed_house: {
    width: 3,
    height: 3,
    wallThickness: WALL,
    enterable: false,
    floor: 'rubble',
    walls: walls(
      ['x', 0, 0, ['stone_ruin', 'stone_tall', 'stone_ruin']],
      ['y', 0, 0, ['stone_mid', 'stone_ruin', 'stone_mid']],
      ['x', 0, 3, ['stone_mid', 'stone_mid', 'stone_mid']],
      ['y', 3, 0, ['stone_mid', 'stone_mid', 'stone_mid']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'stone_post_mid' },
      { x: 3, y: 0, variant: 'stone_post_mid' },
      { x: 0, y: 3, variant: 'stone_post_mid' },
      { x: 3, y: 3, variant: 'stone_post_mid' },
    ],
    decals: [{ x: 3.35, y: 1.6, variant: 'rubble' }],
    props: [
      { x: 0, y: 0, type: 'rubble_mound' },
      { x: 2, y: 0, type: 'rubble_heap' },
      { x: 2, y: 1, type: 'beam_pile' },
      { x: 0, y: 2, type: 'rubble_heap' },
      { x: 1, y: 2, type: 'rubble_heap' },
      { x: 2, y: 2, type: 'rubble_heap' },
    ],
  },

  /** Type B: half-timbered hall fallen in on itself. */
  collapsed_hall: {
    width: 4,
    height: 3,
    wallThickness: WALL,
    enterable: false,
    floor: 'rubble',
    walls: walls(
      ['x', 0, 0, ['tall_broken', 'tall_gable', 'tall_broken', 'mid_broken']],
      ['y', 0, 0, ['tall_broken', 'mid_broken', 'mid_broken']],
      ['x', 0, 3, ['mid_broken', 'mid_broken', 'mid_broken', 'mid_broken']],
      ['y', 4, 0, ['mid_broken', 'mid_broken', 'mid_broken']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'post_mid' },
      { x: 4, y: 0, variant: 'post_tall' },
      { x: 0, y: 3, variant: 'post_mid' },
      { x: 4, y: 3, variant: 'post_mid' },
    ],
    decals: [{ x: 2.0, y: 3.35, variant: 'rubble' }],
    props: [
      { x: 0, y: 0, type: 'beam_pile' },
      { x: 1, y: 0, type: 'rubble_mound' },
      { x: 3, y: 0, type: 'rubble_heap' },
      { x: 3, y: 1, type: 'beam_pile' },
      { x: 0, y: 1, type: 'rubble_heap' },
      { x: 0, y: 2, type: 'rubble_heap' },
      { x: 1, y: 2, type: 'beam_pile' },
      { x: 2, y: 2, type: 'rubble_heap' },
      { x: 3, y: 2, type: 'rubble_heap' },
    ],
  },

  /**
   * Ruined chapel (7 x 12): tall Gothic back walls with lancet windows, a broken facade with an open
   * arched doorway, a low ruined south side with a side entrance. The nave is walkable between two
   * rows of columns; the back-right corner and the altar end are blocked by the collapse.
   */
  chapel: {
    width: 7,
    height: 12,
    wallThickness: 0.26,
    enterable: true,
    floor: 'stone',
    walls: walls(
      ['x', 0, 0, ['gothic_tall', 'gothic_lancet', 'gothic_tall', 'gothic_lancet', 'gothic_tall', 'gothic_broken', 'stone_ruin']],
      [
        'y',
        0,
        0,
        ['gothic_tall', 'gothic_lancet', 'gothic_tall', 'gothic_tall', 'gothic_lancet', 'gothic_tall', 'gothic_broken', 'stone_ruin', 'gothic_tall', 'gothic_lancet', 'gothic_tall', 'gothic_tall'],
      ],
      ['x', 0, 12, ['gothic_broken', 'stone_mid', 'gothic_tall', 'arch_open', 'gothic_tall', 'stone_mid', 'stone_ruin']],
      ['y', 7, 0, ['stone_mid', 'stone_low', 'low_rubble', 'stone_low', 'stone_mid', 'stone_low', null, 'stone_low', 'stone_mid', 'stone_low', 'low_rubble', 'stone_mid']],
    ),
    posts: [
      { x: 0, y: 0, variant: 'buttress' },
      { x: 7, y: 0, variant: 'stone_post_tall' },
      { x: 0, y: 12, variant: 'buttress' },
      { x: 7, y: 12, variant: 'stone_post_mid' },
      { x: 0, y: 4, variant: 'buttress' },
      { x: 0, y: 8, variant: 'buttress' },
      { x: 3, y: 0, variant: 'buttress' },
      { x: 7, y: 6, variant: 'stone_post_mid' },
      { x: 7, y: 7, variant: 'stone_post_low' },
      { x: 3, y: 12, variant: 'stone_post_tall' },
      { x: 4, y: 12, variant: 'stone_post_tall' },
    ],
    decals: [
      { x: 2.5, y: 6.5, variant: 'rubble' },
      { x: 4.6, y: 3.6, variant: 'fallen_beam' },
      { x: 3.5, y: 9.4, variant: 'rubble_small' },
      { x: 7.3, y: 2.5, variant: 'rubble' },
      { x: 7.3, y: 10.4, variant: 'rubble' },
      { x: 1.6, y: 10.2, variant: 'rubble_small' },
    ],
    props: [
      { x: 1, y: 2, type: 'pillar' },
      { x: 1, y: 5, type: 'pillar_broken' },
      { x: 1, y: 8, type: 'pillar' },
      { x: 5, y: 5, type: 'pillar' },
      { x: 5, y: 8, type: 'pillar_broken' },
      { x: 2, y: 1, type: 'altar' },
      { x: 5, y: 0, type: 'rubble_mound' },
      { x: 5, y: 2, type: 'rubble_heap' },
      { x: 6, y: 2, type: 'rubble_heap' },
      { x: 0, y: 0, type: 'rubble_heap' },
      { x: 5, y: 10, type: 'fallen_column' },
    ],
  },
};
