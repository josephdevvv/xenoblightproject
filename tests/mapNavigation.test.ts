import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TileCoord } from '../src/core/types';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS, CITY_GATE, ORIGINAL_ROW_OFFSET } from '../src/world/maps/AshenCrossroads';
import { MAP_OBJECTS } from '../src/world/objects/MapObjectCatalog';
import { STRUCTURE_BLUEPRINTS } from '../src/world/structures/StructureBlueprints';

/** Same footprint the player uses (PlayerController: radius 0.22 tiles). */
const PLAYER_RADIUS = 0.22;
const map = new MapLayout(ASHEN_CROSSROADS);
const def = ASHEN_CROSSROADS;

const boxAt = (x: number, y: number) => ({ minX: x - PLAYER_RADIUS, minY: y - PLAYER_RADIUS, maxX: x + PLAYER_RADIUS, maxY: y + PLAYER_RADIUS });
const standable = (c: number, r: number): boolean => map.isAreaFree(boxAt(c + 0.5, r + 0.5));

/** Can the player walk in a straight line between two neighbouring tile centres? (swept in small steps) */
function canStep(c0: number, r0: number, c1: number, r1: number): boolean {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    if (!map.isAreaFree(boxAt(c0 + 0.5 + (c1 - c0) * t, r0 + 0.5 + (r1 - r0) * t))) return false;
  }
  return true;
}

/** Flood fill over tile centres from the spawn, with the player's real collision. */
function reachableFrom(start: TileCoord): { reached: boolean[][]; parent: Map<number, number> } {
  const reached = Array.from({ length: map.rows }, () => Array<boolean>(map.cols).fill(false));
  const parent = new Map<number, number>();
  const queue: TileCoord[] = [start];
  reached[start.row][start.col] = true;
  while (queue.length) {
    const { col, row } = queue.shift()!;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col + dc;
      const r = row + dr;
      if (!map.isInside(c, r) || reached[r][c] || !standable(c, r) || !canStep(col, row, c, r)) continue;
      reached[r][c] = true;
      parent.set(r * map.cols + c, row * map.cols + col);
      queue.push({ col: c, row: r });
    }
  }
  return { reached, parent };
}

const { reached, parent } = reachableFrom(def.spawn);

test('expanded map: 30 x 120 tiles, original spawn kept and walkable', () => {
  assert.equal(map.cols, 30);
  assert.equal(map.rows, 120);
  assert.deepEqual(def.spawn, { col: 14, row: 28 + ORIGINAL_ROW_OFFSET });
  assert.ok(standable(def.spawn.col, def.spawn.row));
});

test('original area preserved: every original prop, house, vent and road moved by exactly 90 rows', () => {
  const at = (type: string, col: number, row: number) => map.objects.some((o) => o.type === type && o.col === col && o.row === row);
  // spot-check landmarks of the original map
  assert.ok(at('shrine', 14, 14 + 90), 'shrine');
  assert.ok(at('brazier', 12, 12 + 90) && at('brazier', 16, 16 + 90), 'braziers');
  assert.ok(def.structures.some((s) => s.type === 'ruined_house' && s.col === 21 && s.row === 6 + 90), 'ruined house');
  assert.ok(def.paths.some((p) => p.col === 14 && p.row === 18 + 90 && p.h === 12), 'south road to the spawn');
  // nothing new was placed inside the original area (rows 90-119) except the road joining it
  const originalObjects = map.objects.filter((o) => o.row >= ORIGINAL_ROW_OFFSET);
  assert.equal(originalObjects.length, 34, 'same 34 props as before');
});

test('every zone is reachable from the spawn', () => {
  for (const z of def.zones ?? []) {
    assert.ok(reached[z.probe.row][z.probe.col], `${z.name}: probe (${z.probe.col}, ${z.probe.row}) not reachable`);
  }
});

test('the main route runs spawn -> street -> plaza -> chapel (shortest path passes through every zone)', () => {
  const chapel = def.zones!.find((z) => z.id === 'zone5_chapel')!.probe;
  let key = chapel.row * map.cols + chapel.col;
  const rowsOnPath = new Set<number>();
  while (parent.has(key)) {
    rowsOnPath.add(Math.floor(key / map.cols));
    key = parent.get(key)!;
  }
  for (const z of def.zones!.filter((z) => z.id !== 'zone4_housing' && z.id !== 'zone4_avenue')) {
    const hit = [...rowsOnPath].some((r) => r >= z.area.row && r < z.area.row + z.area.h);
    assert.ok(hit, `main route misses ${z.name}`);
  }
});

test('enterable ruins can be entered; collapsed ruins are sealed and fully blocked', () => {
  def.structures.forEach((s, i) => {
    const bp = STRUCTURE_BLUEPRINTS[s.type];
    const inside: TileCoord[] = [];
    for (let r = s.row; r < s.row + bp.height; r++) for (let c = s.col; c < s.col + bp.width; c++) inside.push({ col: c, row: r });
    const reachedInside = inside.filter((t) => reached[t.row][t.col]);
    if (bp.enterable) {
      assert.ok(reachedInside.length > 0, `${s.type} #${i} at (${s.col}, ${s.row}) cannot be entered`);
      // the walkable floor is actually used: at least a third of the interior is reachable
      assert.ok(reachedInside.length >= inside.length / 3, `${s.type} #${i}: only ${reachedInside.length}/${inside.length} interior tiles reachable`);
    } else {
      assert.equal(reachedInside.length, 0, `${s.type} #${i} at (${s.col}, ${s.row}) is supposed to be sealed`);
      for (const t of inside) assert.ok(map.isTileBlocked(t.col, t.row), `${s.type} #${i}: interior tile (${t.col}, ${t.row}) is not filled`);
    }
  });
});

test('no invisible walls on the main roads (street, district lane, avenue, chapel door)', () => {
  const lanes: [number, number, number, number][] = [
    [13, 60, 3, 32], // main street incl. the gate and the join with the original road
    [8, 21, 3, 22], // district lane + plaza exit
    [21, 21, 3, 19], // pilgrim avenue (incl. the arcade)
  ];
  for (const [c0, r0, w, h] of lanes) {
    for (let r = r0; r < r0 + h; r++) {
      for (let c = c0; c < c0 + w; c++) {
        assert.ok(standable(c, r) && reached[r][c], `road tile (${c}, ${r}) blocked or unreachable`);
      }
    }
  }
  // chapel facade doorway and the walk to the altar
  for (let r = 16; r >= 6; r--) assert.ok(reached[r][6], `chapel nave (6, ${r})`);
  // the approach road all the way to the city gate
  for (let r = 15; r >= 3; r--) for (let c = 13; c <= 16; c++) assert.ok(reached[r][c], `gate approach (${c}, ${r})`);
});

test('solid things block: walls, buildings and large props cannot be walked through', () => {
  // a tall chapel back wall
  assert.equal(map.isAreaFree(boxAt(6.5, 4.05)), false, 'chapel back wall');
  // city wall next to the gate
  assert.equal(map.isAreaFree(boxAt(9.5, 88.0)), false, 'city wall');
  // every tile of every blocking prop is blocked
  for (const o of map.objects) {
    if (MAP_OBJECTS[o.type].category !== 'blocking') continue;
    for (let r = o.row; r < o.row + o.spec.h; r++) {
      for (let c = o.col; c < o.col + o.spec.w; c++) assert.ok(map.isTileBlocked(c, r), `${o.type} at (${c}, ${r})`);
    }
  }
});

test('map edges are closed: nothing outside the 30 x 120 grid is walkable', () => {
  for (let r = 0; r < map.rows; r++) {
    assert.equal(map.isAreaFree(boxAt(-0.1, r + 0.5)), false);
    assert.equal(map.isAreaFree(boxAt(map.cols + 0.1, r + 0.5)), false);
  }
  for (let c = 0; c < map.cols; c++) {
    assert.equal(map.isAreaFree(boxAt(c + 0.5, -0.1)), false);
    assert.equal(map.isAreaFree(boxAt(c + 0.5, map.rows + 0.1)), false);
  }
});

test('no trapped pockets: every standable tile outside sealed ruins is reachable', () => {
  const sealed = (c: number, r: number) => {
    const i = map.structureAt(c, r);
    return i >= 0 && !STRUCTURE_BLUEPRINTS[def.structures[i].type].enterable;
  };
  const pockets: string[] = [];
  let walkable = 0;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (!standable(c, r) || sealed(c, r)) continue;
      walkable++;
      if (!reached[r][c]) pockets.push(`(${c}, ${r})`);
    }
  }
  console.log(`walkable tiles: ${walkable}, reachable: ${walkable - pockets.length}`);
  assert.deepEqual(pockets, []);
});

test('the far edge is a closed city wall: every tile of rows 0-1 and the gatehouse blocks, the gate front is reachable', () => {
  for (let c = 0; c < map.cols; c++) {
    for (const r of [0, 1]) assert.ok(map.isTileBlocked(c, r), `city wall tile (${c}, ${r})`);
  }
  for (let r = CITY_GATE.row; r < CITY_GATE.row + CITY_GATE.h; r++) {
    for (let c = CITY_GATE.col; c < CITY_GATE.col + CITY_GATE.w; c++) assert.ok(map.isTileBlocked(c, r), `gatehouse (${c}, ${r})`);
  }
  assert.ok(reached[CITY_GATE.front.row][CITY_GATE.front.col], 'the player can walk up to the gate');
  // standing right at the gate, the player cannot step into it
  assert.equal(map.isAreaFree(boxAt(CITY_GATE.front.col + 0.5, CITY_GATE.front.row + 0.1)), false);
});

test('hand-made city wall sprites line up with their collision footprints', async () => {
  const { readPng } = await import('./helpers/png');
  const registry = (await import('../src/world/objects/handmadeArt.generated.json')).default as Record<string, { file: string; width: number; height: number; anchorX: number; anchorY: number }>;
  for (const [id, art] of Object.entries(registry)) {
    const spec = MAP_OBJECTS[id as keyof typeof MAP_OBJECTS];
    assert.ok(spec, `${id} is a known prop`);
    const img = readPng(`public/assets/environment/city_wall/${art.file}`);
    assert.equal(img.width, art.width, `${id} width`);
    assert.equal(img.height, art.height, `${id} height`);
    let left = img.width, right = -1, bottom = -1;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (img.data[(y * img.width + x) * 4 + 3] < 128) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    // footprint diamond corners relative to its centre (world px): left/right at -/+ (w+h)/2 * 32,
    // bottom corner at (w-h)/2 * 32, (w+h)/2 * 16
    const half = ((spec.w + spec.h) / 2) * 32;
    assert.ok(Math.abs(art.anchorX - half - left) <= 4, `${id}: left edge ${left} vs footprint ${art.anchorX - half}`);
    assert.ok(Math.abs(art.anchorX + half - (right + 1)) <= 4, `${id}: right edge ${right + 1} vs footprint ${art.anchorX + half}`);
    assert.ok(Math.abs(art.anchorY + ((spec.w + spec.h) / 2) * 16 - (bottom + 1)) <= 4, `${id}: bottom ${bottom + 1} vs footprint`);
  }
});
