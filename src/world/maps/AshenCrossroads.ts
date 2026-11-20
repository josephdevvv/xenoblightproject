import type { TileCoord } from '../../core/types';
import type { DecorPlacement, MapDefinition, MapObjectPlacement, MapRect, StructurePlacement, WallRun } from '../MapData';

/**
 * Ashen Crossroads - the first playable map, expanded into a ruined medieval city.
 *
 * Projection reminder (IsoProjection): +col runs down-right on screen, +row runs down-left, so the
 * screen's UPPER-RIGHT is the -row direction. The original 30 x 30 map was extended 90 rows in that
 * direction (3x its length): 30 cols x 120 rows. The original layout is kept tile for tile and simply
 * moved down by ORIGINAL_ROW_OFFSET rows, so its spawn, props, house and roads are unchanged.
 *
 *   rows   0 - 20   Zone 5  Deep ruin landmark: the city wall with its closed gate (rows 0-2), the ruined
 *                           chapel and bell tower, the graveyard
 *   rows  21 - 41   Zone 4  Collapsed housing district (west)  |  pilgrim avenue to the chapel (east)
 *   rows  42 - 61   Zone 3  Central ruin plaza with the toppled monument
 *   rows  62 - 89   Zone 2  Broken medieval street behind the destroyed city gate
 *   rows  90 - 119  Zone 1  Starting edge = the original Ashen Crossroads (spawn 14, 118)
 */
export const ORIGINAL_ROW_OFFSET = 90;
const COLS = 30;
const ROWS = 120;

// ---------------------------------------------------------------------------------------------
// Zone 1 - the original map, in its original coordinates (shifted below)
// ---------------------------------------------------------------------------------------------

const ORIGINAL = {
  paths: [
    { col: 11, row: 11, w: 7, h: 7 }, // central plaza
    { col: 14, row: 2, w: 1, h: 9 }, // north road (now continues into the city)
    { col: 14, row: 18, w: 1, h: 12 }, // south road (runs to the map edge / spawn)
    { col: 2, row: 14, w: 9, h: 1 }, // west road
    { col: 18, row: 14, w: 10, h: 1 }, // east road
    { col: 5, row: 5, w: 9, h: 1 }, // north-west branch
    { col: 5, row: 6, w: 1, h: 8 },
    { col: 20, row: 15, w: 1, h: 6 }, // south-east branch
    { col: 15, row: 21, w: 6, h: 1 },
    { col: 22, row: 9, w: 1, h: 5 }, // track from the east road to the ruined house door
  ] as MapRect[],
  vents: [
    { col: 8, row: 19 },
    { col: 24, row: 23 },
    { col: 6, row: 24 },
  ] as TileCoord[],
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
  ] as MapObjectPlacement[],
  // 3x3 footprint (192 x 96 px) centred on tile (22, 7)
  structures: [{ type: 'ruined_house', col: 21, row: 6 }] as StructurePlacement[],
  spawn: { col: 14, row: 28 },
};

const down = <T extends { row: number }>(item: T): T => ({ ...item, row: item.row + ORIGINAL_ROW_OFFSET });

/** Original tile coordinates -> expanded map coordinates (also used by the monster spawn table). */
export function fromOriginal(p: TileCoord): TileCoord {
  return { col: p.col, row: p.row + ORIGINAL_ROW_OFFSET };
}

// ---------------------------------------------------------------------------------------------
// Helpers for the new zones
// ---------------------------------------------------------------------------------------------

const rect = (col: number, row: number, w: number, h: number, surface?: MapRect['surface']): MapRect => ({ col, row, w, h, surface });
const obj = (type: MapObjectPlacement['type'], col: number, row: number): MapObjectPlacement => ({ type, col, row });
const house = (type: StructurePlacement['type'], col: number, row: number): StructurePlacement => ({ type, col, row });
const wallX = (col: number, row: number, variants: WallRun['variants'], posts = true): WallRun => ({ orientation: 'x', col, row, variants, posts });
const wallY = (col: number, row: number, variants: WallRun['variants'], posts = true): WallRun => ({ orientation: 'y', col, row, variants, posts });

// ---------------------------------------------------------------------------------------------
// Zone 2 - broken medieval street (rows 62 - 89)
// ---------------------------------------------------------------------------------------------

const ZONE2 = {
  paths: [
    rect(13, 88, 3, 4, 'cobble_broken'), // joins the original north road (col 14) to the gate
    rect(13, 60, 3, 28, 'cobble_broken'), // main street, three tiles wide
    rect(13, 79, 3, 4), // intact stretches
    rect(13, 67, 3, 3),
    rect(5, 63, 8, 2, 'cobble_broken'), // west cross street
    rect(5, 65, 2, 23, 'cobble_broken'), // west alley (side route) to the west wall gap
    rect(16, 70, 8, 2, 'cobble_broken'), // east cross street
    rect(22, 72, 2, 16, 'cobble_broken'), // east alley (side route) to the east wall gap
  ],
  structures: [
    house('collapsed_house', 9, 83), // Type B
    house('stone_house', 8, 76), // Type A, door faces the street
    house('ruined_house', 9, 67), // Type A, door towards the cross street side
    house('stone_house_b', 17, 79), // Type A, door faces the street
    house('collapsed_hall', 17, 73), // Type B
    house('collapsed_house', 18, 64), // Type B
    house('courtyard', 0, 72), // Type A, walled yard off the west alley
    house('timber_house', 25, 78), // Type A, east of the alley
  ],
  walls: [
    // Destroyed city wall with the main gate (cols 13-15) and two side gaps (cols 5-6, col 22)
    wallX(1, 88, ['stone_ruin', 'stone_mid', 'stone_tall', 'stone_mid', null, null, 'stone_low', 'stone_mid', 'stone_tall', 'stone_ruin', 'stone_mid']),
    wallX(13, 88, ['arch_broken'], false),
    wallX(17, 88, ['stone_mid', 'stone_tall', 'stone_ruin', 'stone_mid', 'stone_low', null, 'stone_mid', 'stone_tall', 'stone_ruin', 'stone_mid', 'stone_low', 'stone_ruin']),
    // roadside garden walls
    wallY(7, 80, ['stone_low', 'stone_mid', null, 'stone_low']),
    wallX(26, 84, ['stone_low', null, 'stone_mid']),
  ],
  objects: [
    obj('gate_tower', 12, 88),
    obj('gate_tower', 16, 88),
    obj('rubble_heap', 11, 87),
    obj('rubble_heap', 17, 87),
    obj('rubble_mound', 18, 85),
    obj('cart_broken', 16, 84),
    obj('barrels', 12, 81),
    obj('crate_stack', 12, 75),
    obj('crate', 16, 77),
    obj('beam_pile', 12, 72),
    obj('barrel', 16, 68),
    obj('rubble_heap', 12, 65),
    obj('fallen_column', 16, 62),
    obj('fence_y', 4, 66),
    obj('fence_y', 4, 67),
    obj('fence_y', 4, 69),
    obj('dead_tree', 2, 64),
    obj('dead_tree', 1, 81),
    obj('rubble_heap', 3, 84),
    obj('beam_pile', 1, 78),
    obj('cart_broken', 7, 72),
    obj('dead_tree', 27, 66),
    obj('rubble_mound', 25, 70),
    obj('fence_x', 25, 76),
    obj('fence_x', 27, 76),
    obj('barrels', 24, 82),
    obj('dead_tree', 28, 86),
    obj('rubble_heap', 21, 66),
    obj('crate', 21, 77),
  ],
};

// ---------------------------------------------------------------------------------------------
// Zone 3 - central ruin plaza (rows 42 - 61)
// ---------------------------------------------------------------------------------------------

const ZONE3 = {
  paths: [
    rect(7, 45, 16, 13, 'plaza'),
    rect(9, 43, 12, 2, 'plaza'),
    rect(9, 58, 12, 2, 'plaza'),
    rect(5, 47, 2, 9, 'plaza'),
    rect(23, 47, 2, 9, 'plaza'),
    rect(8, 40, 3, 3, 'cobble_broken'), // north-west exit -> housing district
    rect(20, 40, 3, 3, 'cobble_broken'), // north-east exit -> pilgrim avenue
  ],
  walls: [
    // south edge, open where the street arrives
    wallX(6, 60, ['stone_mid', 'stone_ruin', null, 'stone_low', 'stone_mid', 'stone_tall', 'stone_ruin']),
    wallX(16, 60, ['stone_ruin', 'stone_tall', 'stone_mid', 'stone_low', null, 'stone_mid', 'stone_ruin', 'stone_low']),
    // west and east sides (broken)
    wallY(4, 45, ['stone_mid', 'stone_ruin', 'stone_tall', 'stone_mid', null, null, 'stone_low', 'stone_mid', 'stone_ruin', 'stone_tall', 'stone_mid', 'stone_low', 'stone_ruin']),
    wallY(26, 45, ['stone_low', 'stone_mid', null, null, 'stone_ruin', 'stone_mid', 'stone_low', null, 'stone_mid', 'stone_low', 'stone_ruin', null, 'stone_low']),
    // north edge with the two exits
    wallX(4, 42, ['stone_ruin', 'stone_tall', 'stone_mid', 'stone_ruin']),
    wallX(11, 42, ['stone_mid', 'stone_tall', 'stone_tall', 'stone_ruin', 'stone_mid', 'stone_low', 'stone_mid', 'stone_tall', 'stone_ruin']),
    wallX(23, 42, ['stone_ruin', 'stone_mid', 'stone_tall', 'stone_ruin']),
  ],
  objects: [
    obj('monument', 13, 50),
    obj('statue_broken', 14, 46),
    obj('pillar', 9, 46),
    obj('pillar_broken', 20, 46),
    obj('statue_broken', 9, 56),
    obj('pillar', 20, 56),
    obj('brazier', 11, 49),
    obj('brazier', 18, 54),
    obj('fallen_column', 17, 57),
    obj('pillar_broken', 7, 51),
    obj('pillar_broken', 22, 51),
    obj('rubble_heap', 5, 46),
    obj('rubble_heap', 24, 56),
    obj('rubble_heap', 6, 58),
    obj('crate', 23, 45),
    obj('dead_tree', 2, 52),
    obj('dead_tree', 27, 44),
    obj('dead_tree', 28, 58),
    obj('rubble_mound', 1, 57),
    obj('beam_pile', 27, 50),
  ],
};

// ---------------------------------------------------------------------------------------------
// Zone 4 - collapsed housing district (west, rows 21 - 41) + pilgrim avenue (east)
// ---------------------------------------------------------------------------------------------

const ZONE4 = {
  paths: [
    rect(8, 21, 3, 19, 'cobble_broken'), // district lane
    rect(1, 29, 20, 2, 'cobble_broken'), // cross lane, joins the avenue
    rect(8, 33, 3, 3), // intact stretch
    rect(21, 21, 3, 22, 'cobble_broken'), // pilgrim avenue
    rect(21, 32, 3, 4),
  ],
  structures: [
    house('courtyard', 1, 22), // Type A
    house('collapsed_house', 4, 32), // Type B
    house('stone_hall', 1, 35), // Type A, two rooms
    house('timber_house', 12, 22), // Type A
    house('ruined_house', 12, 32), // Type A
    house('stone_house', 15, 32), // Type A, door towards the avenue
    house('collapsed_hall', 12, 37), // Type B
    house('collapsed_house', 25, 22), // Type B
    house('stone_house_b', 16, 25), // Type A, door towards the lane side
  ],
  walls: [
    // the broken arcade across the avenue - three open arches
    wallX(21, 27, ['arch_broken', 'arch_open', 'arch_broken']),
    // garden walls in the district
    wallX(1, 28, ['stone_low', 'stone_mid', null, 'stone_low']),
    wallY(11, 36, ['stone_low', null, 'stone_mid']),
  ],
  objects: [
    obj('crate', 7, 23),
    obj('barrels', 7, 27),
    obj('beam_pile', 7, 33),
    obj('table_broken', 0, 33),
    obj('dead_tree', 1, 31),
    obj('rubble_heap', 7, 39),
    obj('cart_broken', 2, 40),
    obj('crate_stack', 11, 27),
    obj('rubble_heap', 11, 31),
    obj('barrel', 16, 28),
    obj('rubble_mound', 18, 38),
    obj('fence_x', 13, 41),
    obj('fence_x', 15, 41),
    // avenue: statues and pillars lining the road
    obj('statue_broken', 20, 23),
    obj('statue_broken', 24, 23),
    obj('pillar_broken', 24, 30),
    obj('pillar', 20, 36),
    obj('pillar', 24, 36),
    obj('statue_broken', 20, 40),
    obj('pillar_broken', 24, 40),
    obj('fallen_column', 16, 36),
    // graveyard east of the avenue
    obj('fence_y', 25, 30),
    obj('fence_y', 25, 31),
    obj('fence_y', 25, 33),
    obj('tombstone', 26, 30),
    obj('tombstone', 28, 30),
    obj('tombstone', 27, 32),
    obj('tombstone', 26, 34),
    obj('tombstone', 28, 34),
    obj('tombstone', 27, 36),
    obj('tombstone', 26, 38),
    obj('tombstone', 28, 38),
    obj('dead_tree', 28, 27),
    obj('dead_tree', 27, 40),
  ],
};

// ---------------------------------------------------------------------------------------------
// Zone 5 - deep ruin landmark: the city wall and gate, the ruined chapel (rows 0 - 20)
// ---------------------------------------------------------------------------------------------

/**
 * The far end of the map is the outer wall of the old city: the last two rows are a continuous stone
 * wall of towers and curtain-wall segments with a gatehouse in the middle. The gate is CLOSED (it is
 * the future way into the city), so the whole wall line blocks movement. A straight approach road
 * runs from the chapel courtyard to the gate, lined with statues and braziers; the ruined chapel and
 * its bell tower stand west of the road, the collapsed sacristy and the graveyard east of it.
 */
const ZONE5 = {
  paths: [
    rect(2, 16, 24, 5, 'plaza'), // chapel courtyard
    rect(13, 3, 4, 13, 'cobble_broken'), // approach road to the city gate
    rect(13, 7, 4, 3), // intact stretch
  ],
  structures: [
    house('chapel', 3, 4), // Type A: nave enterable, collapsed corner blocked
    house('collapsed_house', 19, 6), // Type B: collapsed sacristy
  ],
  walls: [
    // low graveyard wall with openings
    wallY(22, 5, ['stone_low', 'stone_mid', null, 'stone_low', 'stone_ruin', null, 'stone_low', 'stone_mid', null, 'stone_low']),
  ],
  objects: [
    // the city wall (rows 0-1) and the closed gatehouse (cols 12-17, rows 0-2)
    obj('city_tower', 0, 0),
    obj('city_wall', 2, 0),
    obj('city_tower', 5, 0),
    obj('city_wall_broken', 7, 0),
    obj('city_tower', 10, 0),
    obj('city_gate', 12, 0),
    obj('city_tower', 18, 0),
    obj('city_wall', 20, 0),
    obj('city_tower', 23, 0),
    obj('city_wall_broken', 25, 0),
    obj('city_tower', 28, 0),
    // rubble fallen from the wall
    obj('rubble_heap', 1, 2),
    obj('rubble_heap', 4, 2),
    obj('rubble_heap', 9, 2),
    obj('rubble_mound', 20, 2),
    obj('rubble_heap', 26, 2),
    obj('beam_pile', 28, 3),
    obj('fallen_column', 18, 5),
    // the approach: braziers at the gate, statues along the road
    obj('brazier', 12, 3),
    obj('brazier', 17, 3),
    obj('statue_broken', 12, 6),
    obj('statue_broken', 17, 6),
    obj('pillar_broken', 12, 10),
    obj('statue_broken', 17, 10),
    obj('bell_tower', 10, 13),
    // behind the chapel
    obj('dead_tree', 1, 6),
    obj('tombstone', 1, 9),
    obj('rubble_heap', 0, 12),
    obj('dead_tree', 1, 14),
    // graveyard
    obj('tombstone', 23, 6),
    obj('tombstone', 25, 6),
    obj('tombstone', 27, 6),
    obj('tombstone', 24, 8),
    obj('tombstone', 26, 8),
    obj('tombstone', 23, 10),
    obj('statue_broken', 25, 10),
    obj('tombstone', 27, 10),
    obj('tombstone', 24, 12),
    obj('tombstone', 26, 13),
    obj('dead_tree', 28, 12),
    obj('dead_tree', 23, 14),
    // courtyard
    obj('statue_broken', 10, 18),
    obj('statue_broken', 19, 18),
    obj('fallen_column', 24, 19),
    obj('rubble_heap', 3, 19),
    obj('dead_tree', 27, 17),
  ],
  decor: [{ type: 'steps', col: 6, row: 16, dy: -0.18 }] as DecorPlacement[],
};

/** Tiles in front of the closed city gate (used by tests and review tooling). */
export const CITY_GATE = { col: 12, row: 0, w: 6, h: 3, front: { col: 15, row: 3 } } as const;

// ---------------------------------------------------------------------------------------------
// Assembled map
// ---------------------------------------------------------------------------------------------

export const ASHEN_CROSSROADS: MapDefinition = {
  id: 'ashen_crossroads',
  name: 'Ashen Crossroads',
  cols: COLS,
  rows: ROWS,
  seed: 1337,
  paths: [...ZONE5.paths, ...ZONE4.paths, ...ZONE3.paths, ...ZONE2.paths, ...ORIGINAL.paths.map(down)],
  vents: ORIGINAL.vents.map(down),
  structures: [...ZONE5.structures, ...ZONE4.structures, ...ZONE2.structures, ...ORIGINAL.structures.map(down)],
  walls: [...ZONE5.walls, ...ZONE4.walls, ...ZONE3.walls, ...ZONE2.walls],
  objects: [...ZONE5.objects, ...ZONE4.objects, ...ZONE3.objects, ...ZONE2.objects, ...ORIGINAL.objects.map(down)],
  decor: ZONE5.decor,
  scatter: [
    // the new city: rubble, moss and weeds everywhere off the main roads
    { area: rect(0, 0, COLS, ORIGINAL_ROW_OFFSET), density: 0.09, types: ['moss', 'weeds', 'pebbles', 'debris', 'crack', 'tile_shards', 'moss'] },
    // a light touch on the original area so the two halves blend
    { area: rect(0, ORIGINAL_ROW_OFFSET, COLS, 6), density: 0.05, types: ['pebbles', 'crack', 'moss'] },
  ],
  zones: [
    { id: 'zone5_chapel', name: 'Zone 5 - City gate and ruined chapel', area: rect(0, 0, COLS, 21), probe: { col: 6, row: 8 } },
    { id: 'zone4_housing', name: 'Zone 4 - Collapsed housing district', area: rect(0, 21, 19, 21), probe: { col: 9, row: 30 } },
    { id: 'zone4_avenue', name: 'Pilgrim avenue (approach to Zone 5)', area: rect(19, 21, 11, 21), probe: { col: 22, row: 30 } },
    { id: 'zone3_plaza', name: 'Zone 3 - Central ruin plaza', area: rect(0, 42, COLS, 20), probe: { col: 10, row: 52 } },
    { id: 'zone2_street', name: 'Zone 2 - Broken medieval street', area: rect(0, 62, COLS, 28), probe: { col: 14, row: 75 } },
    { id: 'zone1_start', name: 'Zone 1 - Starting edge (original map)', area: rect(0, 90, COLS, 30), probe: { col: 14, row: 118 } },
  ],
  spawn: fromOriginal(ORIGINAL.spawn),
};
