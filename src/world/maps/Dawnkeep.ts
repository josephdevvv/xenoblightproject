import type { TileCoord } from '../../core/types';
import type { DecorScatter, MapDefinition, MapObjectPlacement, MapRect, StructurePlacement, WallRun } from '../MapData';
import { MAP_OBJECTS } from '../objects/MapObjectCatalog';
import { STRUCTURE_BLUEPRINTS } from '../structures/StructureBlueprints';

/**
 * Dawnkeep - the first fortress town (one of the six small cities; the Vanguard's town). 96 x 96 tiles.
 *
 * A walled town after a disaster: most houses are burned, roofless or caved in, while the citadel stands intact.
 * Projection reminder (IsoProjection): +col runs down-right on screen, +row down-left, so tile (0, 0) is the top
 * corner, (95, 0) the right corner, (0, 95) the left corner and (95, 95) the bottom corner.
 *
 *   outer wall      a ring of curtain walls and towers on rows / cols 5-6 and 89-90 (a third of the pieces broken)
 *   main gate       on the lower-left wall (row 89-90), cols 46-48, between two intact gate towers; the warp from
 *                   Ashen lands just inside it (ARRIVAL) and the road runs straight up to the plaza
 *   castle zone     the top corner: an intact inner ring (cols / rows 10-32) around the keep, barracks houses,
 *                   knight statues and banners; its gate faces the plaza's north road
 *   plaza zone      the centre (cols 36-59, rows 37-59): a wide flagstone square, a well, broken market stalls
 *   church zone     the right corner: the church with its bell tower in a flagstone courtyard, a walled graveyard
 *   residential     the left and bottom quarters (and a strip north of the plaza): narrow lanes, fenced lots and
 *                   ruined houses - most of the destruction
 * Outside the gate a short apron holds the way back to Ashen (portal dawnkeep_exit).
 */
export const DAWNKEEP_SIZE = 96;
const N = DAWNKEEP_SIZE;

/** Where the warp from Ashen puts the player: just inside the main gate, looking up the road to the plaza. */
export const DAWNKEEP_ARRIVAL: TileCoord = { col: 47, row: 86 };
/** The main gate's opening (walkable) in the outer wall. */
export const DAWNKEEP_GATE = { col: 46, row: 89, w: 3, h: 2 } as const;
/** Right outside the gate: the portal back to Ashen (walkable) between two blocked tiles. */
export const DAWNKEEP_EXIT_PORTAL: TileCoord = { col: 47, row: 91 };
export const DAWNKEEP_EXIT_BLOCKED: readonly TileCoord[] = [
  { col: 46, row: 91 },
  { col: 48, row: 91 },
];

const rect = (col: number, row: number, w: number, h: number, surface?: MapRect['surface']): MapRect => ({ col, row, w, h, surface });
type ObjectType = MapObjectPlacement['type'];
type StructureType = StructurePlacement['type'];

// ---------------------------------------------------------------------------------------------
// Roads and paved areas (walkable; no prop is ever placed on them)
// ---------------------------------------------------------------------------------------------

const ROADS: MapRect[] = [
  // gate apron outside, the gate passage, the main avenue to the plaza
  rect(40, 91, 15, 5, 'cobble_broken'),
  rect(46, 89, 3, 2, 'path'),
  rect(46, 60, 3, 29, 'cobble_broken'),
  rect(46, 79, 3, 6, 'path'),
  // the plaza
  rect(36, 37, 24, 23, 'plaza'),
  // north road from the plaza to the castle gate
  rect(46, 20, 3, 17, 'cobble_broken'),
  rect(33, 20, 13, 3, 'path'),
  rect(31, 20, 2, 3, 'path'),
  // the castle courtyard and its approach to the keep
  rect(12, 12, 19, 19, 'plaza'),
  rect(19, 20, 12, 3, 'path'),
  // the church: road from the plaza, the courtyard
  rect(60, 41, 15, 3, 'cobble_broken'),
  rect(72, 27, 3, 14, 'cobble_broken'),
  rect(64, 12, 13, 15, 'plaza'),
  // residential lanes (west)
  rect(8, 52, 28, 2, 'cobble_broken'),
  rect(21, 34, 2, 55, 'cobble_broken'),
  rect(8, 71, 38, 2, 'cobble_broken'),
  // residential lanes (east and south)
  rect(49, 71, 40, 2, 'cobble_broken'),
  rect(66, 44, 2, 45, 'cobble_broken'),
  rect(60, 52, 29, 2, 'cobble_broken'),
  // the strip north of the plaza
  rect(34, 17, 12, 2, 'cobble_broken'),
  rect(49, 17, 22, 2, 'cobble_broken'),
];

// ---------------------------------------------------------------------------------------------
// Walls: the outer ring and the castle ring, fitted from wall pieces (3 long) and towers (2)
// ---------------------------------------------------------------------------------------------

/** Splits a wall line of `length` tiles into wall pieces (3) and towers (2), a tower about every 16 tiles. */
export function fitWallRun(length: number): ('wall' | 'tower')[] {
  if (length < 2 || length === 1) return [];
  let towers = Math.floor(length / 16);
  let rest = length - towers * 2;
  while (rest % 3 !== 0 && rest > 0) {
    towers++;
    rest -= 2;
  }
  const walls = rest / 3;
  const out: ('wall' | 'tower')[] = [];
  const every = walls / (towers + 1);
  let placedTowers = 0;
  for (let i = 0; i < walls; i++) {
    out.push('wall');
    if (placedTowers < towers && i + 1 >= Math.round(every * (placedTowers + 1))) {
      out.push('tower');
      placedTowers++;
    }
  }
  while (placedTowers++ < towers) out.push('tower');
  return out;
}

const objects: MapObjectPlacement[] = [];
const obj = (type: ObjectType, col: number, row: number): void => {
  objects.push({ type, col, row });
};

/** A wall line from (col, row) along x (`along`='x', pieces 3 x 2) or y (2 x 3). `broken`: every n-th wall piece. */
function wallLine(along: 'x' | 'y', col: number, row: number, length: number, kind: { tower: ObjectType; broken: number }): void {
  let c = col;
  let r = row;
  let n = 0;
  for (const piece of fitWallRun(length)) {
    if (piece === 'tower') {
      obj(kind.tower, c, r);
      if (along === 'x') c += 2;
      else r += 2;
      continue;
    }
    n++;
    const broken = kind.broken > 0 && n % kind.broken === 0;
    if (along === 'x') {
      obj(broken ? 'city_wall_broken' : 'city_wall', c, r);
      c += 3;
    } else {
      obj(broken ? 'city_wall_broken_y' : 'city_wall_y', c, r);
      r += 3;
    }
  }
}

// outer ring: corner towers, four sides; the lower-left side has the main gate
const OUTER = { tower: 'city_tower' as ObjectType, broken: 3 };
for (const [c, r] of [
  [5, 5],
  [89, 5],
  [5, 89],
  [89, 89],
]) {
  obj('city_tower', c, r);
}
wallLine('x', 7, 5, 82, OUTER); // upper-right side
wallLine('y', 5, 7, 82, OUTER); // upper-left side
wallLine('y', 89, 7, 82, OUTER); // lower-right side
wallLine('x', 7, 89, 37, OUTER); // lower-left side, west of the gate
obj('dk_gate_tower', 44, 89);
obj('dk_gate_tower', 49, 89);
wallLine('x', 51, 89, 38, OUTER); // lower-left side, east of the gate

// the castle ring: intact walls, intact towers; its gate (rows 20-22) on the side facing the plaza road
const CASTLE = { tower: 'dk_castle_tower' as ObjectType, broken: 0 };
for (const [c, r] of [
  [10, 10],
  [31, 10],
  [10, 31],
  [31, 31],
]) {
  obj('dk_castle_tower', c, r);
}
wallLine('x', 12, 10, 19, CASTLE);
wallLine('y', 10, 12, 19, CASTLE);
wallLine('x', 12, 31, 19, CASTLE);
wallLine('y', 31, 12, 6, CASTLE);
obj('dk_castle_tower', 31, 18);
obj('dk_castle_tower', 31, 23);
wallLine('y', 31, 25, 6, CASTLE);

// ---------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------

type House = { type: ObjectType | StructureType; col: number; row: number };
const h = (type: House['type'], col: number, row: number): House => ({ type, col, row });

/** The citadel: the keep facing its gate, barracks, statues, banners. Everything intact. */
const CASTLE_BUILDINGS: House[] = [h('dk_keep', 16, 20), h('dk_house_intact', 13, 13), h('dk_house_intact', 24, 13), h('dk_house_intact', 13, 26), h('dk_house_intact', 24, 26), h('dk_house_intact', 27, 15)];

/** The town: 52 buildings, 46 of them ruined (burned, roof torn open, roofless, caved in). */
const TOWN_BUILDINGS: House[] = [
  // west, north of the west lane
  h('dk_ruin_burned', 9, 35),
  h('courtyard', 9, 40),
  h('dk_ruin_shell', 16, 41),
  h('dk_ruin_cottage', 15, 47),
  h('collapsed_hall', 24, 35),
  h('timber_house', 29, 41),
  h('dk_ruin_shell', 30, 47),
  // west, between the west lane and the south lane
  h('stone_hall', 9, 55),
  h('dk_ruin_burned', 16, 55),
  h('dk_house_intact', 9, 66),
  h('dk_ruin_shell', 14, 66),
  h('dk_ruin_shell', 24, 55),
  h('collapsed_house', 34, 55),
  h('stone_house_b', 24, 61),
  h('dk_ruin_burned', 30, 61),
  h('dk_house_intact', 41, 62),
  h('dk_ruin_cottage', 36, 66),
  // south-west, near the wall
  h('dk_ruin_cottage', 9, 74),
  h('courtyard', 14, 79),
  h('dk_ruin_shell', 24, 74),
  h('stone_house', 30, 74),
  h('dk_ruin_burned', 24, 80),
  h('dk_ruin_cottage', 36, 80),
  // east of the avenue
  h('dk_ruin_burned', 50, 61),
  h('dk_ruin_shell', 61, 61),
  h('dk_house_intact', 56, 66),
  h('stone_hall', 69, 55),
  h('dk_ruin_shell', 81, 55),
  h('dk_ruin_cottage', 69, 62),
  h('collapsed_hall', 76, 62),
  h('dk_ruin_burned', 82, 66),
  h('dk_ruin_cottage', 61, 45),
  h('dk_ruin_burned', 69, 45),
  h('dk_ruin_shell', 81, 45),
  // south-east, near the wall
  h('dk_ruin_shell', 50, 74),
  h('stone_house_b', 55, 74),
  h('dk_ruin_cottage', 56, 80),
  h('dk_ruin_burned', 69, 74),
  h('collapsed_hall', 74, 74),
  h('dk_house_intact', 75, 80),
  h('dk_ruin_shell', 81, 80),
  // north of the plaza
  h('dk_ruin_shell', 35, 25),
  h('dk_house_intact', 41, 31),
  h('dk_ruin_burned', 50, 24),
  h('collapsed_hall', 60, 24),
  h('dk_ruin_cottage', 52, 31),
  h('collapsed_house', 62, 31),
  h('dk_ruin_cottage', 36, 9),
  h('dk_ruin_burned', 50, 9),
  h('dk_ruin_shell', 56, 10),
  h('collapsed_house', 38, 13),
  h('dk_house_intact', 57, 14),
];

/** The church quarter: the church in its courtyard, a walled graveyard beside it. */
const CHURCH: House[] = [h('dk_church', 69, 16)];

const structures: StructurePlacement[] = [];
for (const b of [...CASTLE_BUILDINGS, ...TOWN_BUILDINGS, ...CHURCH]) {
  if (b.type in STRUCTURE_BLUEPRINTS) structures.push({ type: b.type as StructureType, col: b.col, row: b.row });
  else obj(b.type as ObjectType, b.col, b.row);
}

/** Buildings by condition (checks / the summary): intact = the citadel's and the few `dk_house_intact`. */
export const DAWNKEEP_BUILDINGS = {
  castle: CASTLE_BUILDINGS.length,
  town: TOWN_BUILDINGS.length,
  townRuined: TOWN_BUILDINGS.filter((b) => b.type !== 'dk_house_intact').length,
};

// ---------------------------------------------------------------------------------------------
// Props: placed only where they fit (never on a road, never on a building or another prop)
// ---------------------------------------------------------------------------------------------

const occupied: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
const mark = (col: number, row: number, w: number, hgt: number): void => {
  for (let r = row; r < row + hgt; r++) for (let c = col; c < col + w; c++) if (r >= 0 && c >= 0 && r < N && c < N) occupied[r][c] = true;
};
for (const o of objects) mark(o.col, o.row, MAP_OBJECTS[o.type].w, MAP_OBJECTS[o.type].h);
for (const s of structures) mark(s.col, s.row, STRUCTURE_BLUEPRINTS[s.type].width, STRUCTURE_BLUEPRINTS[s.type].height);
const onRoad = (col: number, row: number): boolean => ROADS.some((r) => r.surface !== 'plaza' && col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h);

/** Adds a prop if its whole footprint is free and off the roads (plazas / courtyards are fine). */
function prop(type: ObjectType, col: number, row: number): void {
  const { w, h: hgt } = MAP_OBJECTS[type];
  for (let r = row; r < row + hgt; r++) {
    for (let c = col; c < col + w; c++) {
      if (r < 0 || c < 0 || r >= N || c >= N || occupied[r][c] || onRoad(c, r)) return;
    }
  }
  mark(col, row, w, hgt);
  obj(type, col, row);
}

// castle: statues along the approach, banners at the gate and the keep, a well, braziers
for (const [c, r] of [
  [22, 19],
  [22, 23],
  [27, 19],
  [27, 23],
]) {
  prop('dk_knight_statue', c, r);
}
for (const [c, r] of [
  [29, 19],
  [29, 23],
  [19, 19],
  [19, 23],
]) {
  prop('dk_banner', c, r);
}
prop('dk_well', 21, 15);
prop('brazier', 15, 18);
prop('brazier', 15, 24);
prop('crate_stack', 17, 13);
prop('barrels', 28, 28);
// the castle road: banners on both sides
for (const c of [35, 39, 43]) {
  prop('dk_banner', c, 19);
  prop('dk_banner', c, 23);
}

// plaza: the well, broken stalls, the toppled monument, broken statues at the corners
prop('dk_well', 47, 47);
for (const [c, r] of [
  [39, 41],
  [39, 45],
  [39, 49],
  [55, 41],
  [55, 45],
  [55, 49],
]) {
  prop('dk_market_stall', c, r);
}
prop('monument', 41, 53);
for (const [c, r] of [
  [37, 38],
  [58, 38],
  [37, 58],
  [58, 58],
]) {
  prop('statue_broken', c, r);
}
prop('fallen_column', 52, 55);
prop('rubble_heap', 44, 40);
prop('crate_stack', 42, 46);
prop('barrels', 53, 43);
prop('brazier', 45, 51);
prop('brazier', 50, 44);
prop('dk_banner', 45, 36);
prop('dk_banner', 49, 36);

// the gate: towers' braziers and banners inside, barricades left from the defence
prop('dk_banner', 45, 87);
prop('dk_banner', 49, 87);
prop('brazier', 44, 85);
prop('brazier', 50, 85);
prop('dk_barricade', 40, 86);
prop('dk_barricade', 52, 86);
prop('dk_barricade', 42, 82);
prop('dk_barricade', 51, 79);
prop('cart_broken', 43, 77);
prop('rubble_mound', 50, 66);

// the church quarter: a graveyard behind a low wall, broken stonework in the courtyard
const walls: WallRun[] = [
  { orientation: 'y', col: 77, row: 9, variants: ['stone_low', 'stone_mid', 'stone_ruin', null, 'stone_low', 'stone_mid', 'stone_tall', 'stone_ruin', null, 'stone_low', 'stone_mid', 'stone_low', 'stone_ruin', 'stone_mid', 'stone_low'], posts: true },
  { orientation: 'x', col: 78, row: 25, variants: ['stone_low', 'stone_mid', null, 'stone_ruin', 'stone_low', 'stone_mid', 'stone_low', 'stone_ruin', 'stone_mid', 'stone_low'], posts: true },
];
for (let r = 10; r <= 23; r += 2) for (let c = 79; c <= 87; c += 2) prop('tombstone', c + ((r / 2) % 2), r);
prop('statue_broken', 82, 16);
for (const [c, r] of [
  [65, 13],
  [75, 13],
  [65, 25],
  [75, 25],
]) {
  prop('pillar', c, r);
}
prop('pillar_broken', 67, 21);
prop('fallen_column', 69, 24);
prop('altar', 70, 13);
prop('rubble_heap', 66, 17);
prop('brazier', 71, 26);
prop('brazier', 75, 26);

// residential debris: rubble, beams, carts, barrels and fenced lots around the ruins
const DEBRIS: ObjectType[] = ['rubble_heap', 'beam_pile', 'barrels', 'crate', 'rubble_heap', 'cart_broken', 'barrel', 'rubble_mound', 'beam_pile', 'crate_stack', 'dead_tree', 'rock'];
let k = 0;
for (const b of TOWN_BUILDINGS) {
  // two pieces of debris beside each ruin, one beside an intact house; tried around the footprint
  const size = b.type in STRUCTURE_BLUEPRINTS ? STRUCTURE_BLUEPRINTS[b.type as StructureType] : { width: MAP_OBJECTS[b.type as ObjectType].w, height: MAP_OBJECTS[b.type as ObjectType].h };
  const spots: [number, number][] = [
    [b.col + size.width, b.row],
    [b.col - 2, b.row + size.height - 1],
    [b.col, b.row + size.height],
    [b.col + size.width, b.row + size.height - 1],
    [b.col - 1, b.row - 1],
  ];
  const wanted = b.type === 'dk_house_intact' ? 1 : 2;
  let placed = 0;
  for (const [c, r] of spots) {
    if (placed >= wanted) break;
    const before = objects.length;
    prop(DEBRIS[k++ % DEBRIS.length], c, r);
    if (objects.length > before) placed++;
  }
}
// fenced lots along the west and south-east lanes
for (const c of [10, 12, 15, 17, 25, 27, 32]) prop('fence_x', c, 70);
for (const c of [51, 53, 58, 60, 70, 72, 78, 80, 84]) prop('fence_x', c, 70);
for (const r of [57, 59, 64, 68]) prop('fence_y', 20, r);
for (const r of [56, 58, 63, 67]) prop('fence_y', 65, r);
// outside the walls: dead trees and rocks; the gate apron is closed off at both ends
for (let r = 91; r < N; r++) {
  prop(r % 2 ? 'rock' : 'dead_tree', 39, r);
  prop(r % 2 ? 'dead_tree' : 'rock', 55, r);
}
for (let i = 0; i < N; i += 5) {
  prop(i % 10 ? 'dead_tree' : 'rock', i, 1);
  prop(i % 10 ? 'rock' : 'dead_tree', 1, i);
  prop(i % 10 ? 'dead_tree' : 'rock', 93, i);
  if (i < 36 || i > 58) prop(i % 10 ? 'rock' : 'dead_tree', i, 93);
}

// ---------------------------------------------------------------------------------------------
// Ground details and zones
// ---------------------------------------------------------------------------------------------

const RUIN_DETAIL: DecorScatter['types'] = ['debris', 'pebbles', 'crack', 'tile_shards', 'moss', 'weeds', 'debris'];
const scatter: DecorScatter[] = [
  // the citadel is kept clean
  { area: rect(12, 12, 19, 19), density: 0.025, types: ['moss', 'crack'] },
  // the town: rubble and weeds everywhere off the roads, most of all in the residential quarters
  { area: rect(7, 33, 82, 56), density: 0.13, types: RUIN_DETAIL },
  { area: rect(33, 7, 56, 26), density: 0.1, types: RUIN_DETAIL },
  { area: rect(7, 7, 3, 26), density: 0.1, types: RUIN_DETAIL },
  // outside the walls
  { area: rect(0, 0, N, 5), density: 0.06, types: ['moss', 'weeds', 'pebbles'] },
  { area: rect(0, 91, N, 5), density: 0.06, types: ['moss', 'weeds', 'pebbles'] },
];

export const DAWNKEEP: MapDefinition = {
  id: 'dawnkeep',
  name: 'Dawnkeep',
  cols: N,
  rows: N,
  seed: 4242,
  paths: ROADS,
  vents: [],
  objects,
  structures,
  walls,
  scatter,
  blocked: [...DAWNKEEP_EXIT_BLOCKED],
  zones: [
    { id: 'gate', name: 'Main gate (arrival from Ashen)', area: rect(36, 76, 23, 20), probe: DAWNKEEP_ARRIVAL },
    { id: 'plaza', name: 'Wide plaza', area: rect(36, 37, 24, 23), probe: { col: 47, row: 52 } },
    { id: 'castle', name: 'Castle (citadel)', area: rect(10, 10, 23, 23), probe: { col: 25, row: 21 } },
    { id: 'church', name: 'Church and bell tower', area: rect(62, 8, 27, 20), probe: { col: 70, row: 22 } },
    { id: 'residential_west', name: 'Residential quarter (west)', area: rect(7, 33, 29, 56), probe: { col: 21, row: 60 } },
    { id: 'residential_south', name: 'Residential quarter (south, both sides of the avenue)', area: rect(36, 60, 53, 29), probe: { col: 66, row: 78 } },
    { id: 'residential_east', name: 'Residential quarter (east)', area: rect(60, 33, 29, 27), probe: { col: 66, row: 48 } },
    { id: 'residential_north', name: 'Residential strip (north)', area: rect(33, 7, 29, 26), probe: { col: 55, row: 18 } },
  ],
  spawn: DAWNKEEP_ARRIVAL,
};
