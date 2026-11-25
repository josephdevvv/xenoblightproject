import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MONSTER_DEFINITIONS, MONSTER_RESPAWN_DELAY_MS } from '../src/monsters/MonsterDefinition';
import { MONSTER_SPAWNS } from '../src/monsters/MonsterSpawns';
import { NPC_DEFINITIONS, npcsOnMap } from '../src/npcs/NpcDefinition';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { STRUCTURE_BLUEPRINTS } from '../src/world/structures/StructureBlueprints';

const D = ASHEN_CROSSROADS;
const map = new MapLayout(D);
const points = MONSTER_SPAWNS[D.id];
const zone = (id: string) => D.zones.find((z) => z.id === id)!.area;
const inRect = (r: { col: number; row: number; w: number; h: number }, c: number, row: number): boolean => c >= r.col && c < r.col + r.w && row >= r.row && row < r.row + r.h;

/** Walking distance in tiles (4-neighbour steps over walkable tiles) from a tile to every tile. */
function walkingDistance(from: { col: number; row: number }): number[][] {
  const walk = (c: number, r: number): boolean => map.isInside(c, r) && map.isAreaFree({ minX: c + 0.28, minY: r + 0.28, maxX: c + 0.72, maxY: r + 0.72 });
  const d = Array.from({ length: D.rows }, () => Array<number>(D.cols).fill(Infinity));
  const queue: [number, number][] = [[from.col, from.row]];
  d[from.row][from.col] = 0;
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (walk(nc, nr) && d[nr][nc] === Infinity) {
        d[nr][nc] = d[r][c] + 1;
        queue.push([nc, nr]);
      }
    }
  }
  return d;
}

/** The zone each species lives in. */
const ZONE_OF = { voidmite: ['zone1_start'], mutant_wolf: ['zone2_street'], dark_avian: ['zone3_plaza'], mutant_boar: ['zone4_housing', 'zone4_avenue'] } as const;

test('Ashen Crossroads: exactly 20 Void Mites in Zone 1, 20 Mutant Wolves in Zone 2, 20 Dark Avians in Zone 3, 20 Mutant Boars in Zone 4 - 80 in all', () => {
  const count = (id: string) => points.filter((p) => p.monster === id).length;
  assert.deepEqual([count('voidmite'), count('mutant_wolf'), count('dark_avian'), count('mutant_boar'), points.length], [20, 20, 20, 20, 80]);
  assert.deepEqual(new Set(points.map((p) => p.monster)), new Set(['voidmite', 'mutant_wolf', 'dark_avian', 'mutant_boar']), 'no other species');
  assert.deepEqual([zone('zone4_housing'), zone('zone4_avenue')], [{ col: 0, row: 21, w: 19, h: 21, surface: undefined }, { col: 19, row: 21, w: 11, h: 21, surface: undefined }]);
  assert.deepEqual(zone('zone3_plaza'), { col: 0, row: 42, w: 30, h: 20, surface: undefined });
  assert.deepEqual(zone('zone1_start'), { col: 0, row: 90, w: 30, h: 30, surface: undefined });
  assert.deepEqual(zone('zone2_street'), { col: 0, row: 62, w: 30, h: 28, surface: undefined });
  for (const p of points) {
    assert.ok(ZONE_OF[p.monster].some((id) => inRect(zone(id), p.col, p.row)), `${p.monster} (${p.col}, ${p.row}) in its zone`);
  }
  assert.equal(new Set(points.map((p) => `${p.col},${p.row}`)).size, points.length, 'no two on one tile');
});

test('every spawn point: walkable for the monster, not blocked, not in or beside a building, not on a road, spread out', () => {
  const footprints = D.structures.map((s) => {
    const b = STRUCTURE_BLUEPRINTS[s.type];
    return { minX: s.col, minY: s.row, maxX: s.col + b.width, maxY: s.row + b.height, enterable: b.enterable };
  });
  for (const p of points) {
    const at = `${p.monster} (${p.col}, ${p.row})`;
    assert.ok(map.isInside(p.col, p.row) && !map.isTileBlocked(p.col, p.row), `${at}: free tile`);
    assert.ok(p.col >= 1 && p.col <= D.cols - 2, `${at}: not on the map edge`);
    const r = MONSTER_DEFINITIONS[p.monster].footprintRadius + 0.1;
    assert.ok(map.isAreaFree({ minX: p.col + 0.5 - r, minY: p.row + 0.5 - r, maxX: p.col + 0.5 + r, maxY: p.row + 0.5 + r }), `${at}: room for its footprint`);
    // Zone 4 is dense: a boar may stand right beside sealed rubble (no doorway); every house with a way in keeps its ring
    for (const f of footprints) {
      const ring = p.monster === 'mutant_boar' && !f.enterable ? 0 : 1;
      assert.ok(!(p.col >= f.minX - ring && p.col < f.maxX + ring && p.row >= f.minY - ring && p.row < f.maxY + ring), `${at}: clear of buildings and their doorways`);
    }
    if (p.monster === 'dark_avian') {
      // the paved plaza is Zone 3's open ground; its streets and exits (and the tile beside them) stay clear
      const street = D.paths.filter((q) => q.surface !== 'plaza');
      assert.ok(!street.some((q) => inRect({ col: q.col - 1, row: q.row - 1, w: q.w + 2, h: q.h + 2 }, p.col, p.row)), `${at}: clear of streets and exits`);
    } else assert.ok(!D.paths.some((q) => inRect(q, p.col, p.row)), `${at}: not on a road`);
    const nearest = Math.min(...points.filter((q) => q !== p).map((q) => Math.hypot(q.col - p.col, q.row - p.row)));
    assert.ok(nearest >= 4, `${at}: ${nearest.toFixed(1)} tiles from the next monster`);
  }
  for (const p of points.filter((q) => q.monster === 'mutant_wolf')) assert.ok(p.row <= 87, 'inside the city wall (row 88)');
});

test('safety: at least 8 tiles (straight and walking) from the player spawn and every NPC; every point reachable', () => {
  const anchors = [{ name: 'player spawn', ...D.spawn }, ...npcsOnMap(D.id).map((n) => ({ name: n.name, ...n.tile }))];
  assert.deepEqual(anchors.map((a) => a.name), ['player spawn', 'Mateus', 'Jack', 'Sonny', 'Roland']);
  const fromSpawn = walkingDistance(D.spawn);
  for (const a of anchors) {
    const d = walkingDistance(a);
    for (const p of points) {
      const straight = Math.hypot(a.col - p.col, a.row - p.row);
      assert.ok(straight >= 8 && d[p.row][p.col] >= 8, `${p.monster} (${p.col}, ${p.row}) is ${straight.toFixed(1)} / ${d[p.row][p.col]} tiles from ${a.name}`);
    }
  }
  for (const p of points) assert.ok(Number.isFinite(fromSpawn[p.row][p.col]), `${p.monster} (${p.col}, ${p.row}) can be reached`);
  assert.deepEqual(NPC_DEFINITIONS.roland_01.tile, { col: 8, row: 77 });
});

test('respawn: one shared 5 s rule for every monster; combat numbers unchanged', () => {
  assert.equal(MONSTER_RESPAWN_DELAY_MS, 5000);
  for (const def of Object.values(MONSTER_DEFINITIONS)) assert.equal(def.combat.respawnMs, MONSTER_RESPAWN_DELAY_MS, def.id);
  const { voidmite: v, mutant_wolf: w } = MONSTER_DEFINITIONS;
  assert.deepEqual([v.combat.maxHp, v.combat.atk, v.combat.def, w.combat.maxHp, w.combat.atk, w.combat.def], [24, 15, 1, 45, 23, 2]);
});
