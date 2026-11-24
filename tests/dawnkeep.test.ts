import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { TileCoord } from '../src/core/types';
import { DEFAULT_MAP_ID, MAP_REGISTRY, startMapId } from '../src/world/loading/MapRegistry';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { DAWNKEEP, DAWNKEEP_ARRIVAL, DAWNKEEP_BUILDINGS, DAWNKEEP_GATE, DAWNKEEP_SIZE, fitWallRun } from '../src/world/maps/Dawnkeep';
import { DAWNKEEP_ART, DAWNKEEP_ART_BASE } from '../src/world/objects/DawnkeepArt';
import { HANDMADE_OBJECT_ART } from '../src/world/objects/HandmadeArt';
import { MAP_OBJECTS } from '../src/world/objects/MapObjectCatalog';
import { ARRIVAL_OFFSET_PX, arrivalGuard, arrivalPoint, onPortalTile, PORTAL_ART, PORTALS, PortalService, stepWarps, tileCentre, updateWarpGuard, WARP_GUARD, warpAllowed } from '../src/world/Portals';
import { readPng } from './helpers/png';
import { newCharacter, withoutStorage } from './helpers/session';

const PLAYER_RADIUS = 0.22;
const map = new MapLayout(DAWNKEEP);
const standable = (m: MapLayout, c: number, r: number): boolean =>
  m.isAreaFree({ minX: c + 0.5 - PLAYER_RADIUS, minY: r + 0.5 - PLAYER_RADIUS, maxX: c + 0.5 + PLAYER_RADIUS, maxY: r + 0.5 + PLAYER_RADIUS });

/** Tiles the player can walk to from `start` (tile centre steps, the player's real collision, swept). */
function reachable(m: MapLayout, start: TileCoord): boolean[][] {
  const seen = Array.from({ length: m.rows }, () => Array<boolean>(m.cols).fill(false));
  const queue: TileCoord[] = [start];
  seen[start.row][start.col] = true;
  const step = (c0: number, r0: number, c1: number, r1: number): boolean => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const x = c0 + 0.5 + (c1 - c0) * t;
      const y = r0 + 0.5 + (r1 - r0) * t;
      if (!m.isAreaFree({ minX: x - PLAYER_RADIUS, minY: y - PLAYER_RADIUS, maxX: x + PLAYER_RADIUS, maxY: y + PLAYER_RADIUS })) return false;
    }
    return true;
  };
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
      if (!m.isInside(c, r) || seen[r][c] || !step(col, row, c, r)) continue;
      seen[r][c] = true;
      queue.push({ col: c, row: r });
    }
  }
  return seen;
}
const reached = reachable(map, DAWNKEEP_ARRIVAL);
const zone = (id: string) => DAWNKEEP.zones!.find((z) => z.id === id)!;
const inRect = (a: { col: number; row: number; w: number; h: number }, c: number, r: number): boolean => c >= a.col && c < a.col + a.w && r >= a.row && r < a.row + a.h;

test('Dawnkeep: a 96 x 96 map, registered, built without overlaps; the arrival just inside the gate is safe', () => {
  assert.equal(DAWNKEEP_SIZE, 96);
  assert.deepEqual([map.cols, map.rows], [96, 96]);
  assert.ok(MAP_REGISTRY.dawnkeep && MAP_REGISTRY.dawnkeep.definition() === DAWNKEEP);
  assert.deepEqual(DAWNKEEP.spawn, DAWNKEEP_ARRIVAL);
  assert.ok(standable(map, DAWNKEEP_ARRIVAL.col, DAWNKEEP_ARRIVAL.row));
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) assert.ok(standable(map, DAWNKEEP_ARRIVAL.col + dc, DAWNKEEP_ARRIVAL.row + dr), 'room around the arrival');
  assert.ok(DAWNKEEP_ARRIVAL.row < DAWNKEEP_GATE.row && DAWNKEEP_GATE.row - DAWNKEEP_ARRIVAL.row <= 4, 'just inside the gate');
  for (let c = DAWNKEEP_GATE.col; c < DAWNKEEP_GATE.col + DAWNKEEP_GATE.w; c++) {
    for (let r = DAWNKEEP_GATE.row; r < DAWNKEEP_GATE.row + DAWNKEEP_GATE.h; r++) assert.ok(reached[r][c], `the gate opening (${c}, ${r}) is walkable`);
  }
});

test('Dawnkeep: every zone is reachable from the arrival, the four required zones are distinct, the plaza connects them', () => {
  for (const z of DAWNKEEP.zones!) assert.ok(reached[z.probe.row][z.probe.col], `${z.name} reachable`);
  const required = ['plaza', 'castle', 'church', 'residential_west', 'residential_south', 'residential_east', 'residential_north'].map(zone);
  for (let i = 0; i < required.length; i++) {
    for (let j = i + 1; j < required.length; j++) {
      const a = required[i].area;
      const b = required[j].area;
      const overlap = a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
      assert.ok(!overlap, `${required[i].id} / ${required[j].id} do not overlap`);
    }
  }
  // the road from the gate runs straight to the plaza; the plaza's roads lead on to the castle and the church
  for (let r = zone('plaza').area.row + zone('plaza').area.h; r <= DAWNKEEP_ARRIVAL.row; r++) assert.ok(standable(map, 47, r), `avenue (47, ${r})`);
  for (let r = 20; r < zone('plaza').area.row; r++) assert.ok(standable(map, 47, r), `north road (47, ${r})`);
  for (let c = 31; c <= 47; c++) assert.ok(standable(map, c, 21), `castle road (${c}, 21)`);
  for (let c = 60; c <= 73; c++) assert.ok(standable(map, c, 42), `church road (${c}, 42)`);
});

test('Dawnkeep: the outer wall encloses the town - the only way out is the main gate to the apron', () => {
  // outside the ring (beyond the gate apron) nothing can be reached
  for (const [c, r] of [
    [2, 48],
    [48, 2],
    [93, 48],
    [20, 93],
    [80, 93],
  ]) {
    assert.ok(!reached[r][c], `outside (${c}, ${r}) unreachable`);
  }
  assert.ok(reached[93][47], 'the apron outside the gate');
  // the whole wall line is solid except the gate opening
  for (let c = 5; c <= 90; c++) {
    const gate = c >= DAWNKEEP_GATE.col && c < DAWNKEEP_GATE.col + DAWNKEEP_GATE.w;
    assert.equal(map.isTileBlocked(c, 89), !gate, `lower wall (${c}, 89)`);
    assert.ok(map.isTileBlocked(c, 5), `upper wall (${c}, 5)`);
  }
  for (let r = 5; r <= 90; r++) assert.ok(map.isTileBlocked(5, r) && map.isTileBlocked(89, r), `side walls (row ${r})`);
  // fitted wall lines: towers (2) and pieces (3) fill the length exactly
  for (const n of [6, 19, 37, 38, 82]) {
    const run = fitWallRun(n);
    assert.equal(run.reduce((s, p) => s + (p === 'tower' ? 2 : 3), 0), n, `length ${n}`);
  }
});

test('Dawnkeep: a ruined town (~80% of the houses damaged) around an intact citadel; the church quarter has its church', () => {
  assert.equal(DAWNKEEP_BUILDINGS.town, 52);
  const ruinedShare = DAWNKEEP_BUILDINGS.townRuined / (DAWNKEEP_BUILDINGS.town + DAWNKEEP_BUILDINGS.castle);
  assert.ok(ruinedShare >= 0.75 && ruinedShare <= 0.85, `ruined share ${ruinedShare.toFixed(2)}`);
  const castle = zone('castle').area;
  const inCastle = DAWNKEEP.objects.filter((o) => inRect(castle, o.col, o.row));
  const damaged = /broken|ruin|rubble|collapsed|beam_pile|dead_tree/;
  assert.deepEqual(inCastle.filter((o) => damaged.test(o.type)).map((o) => o.type), [], 'nothing broken in the citadel');
  assert.ok(inCastle.some((o) => o.type === 'dk_keep'), 'the keep');
  assert.equal(inCastle.filter((o) => o.type === 'dk_castle_tower').length, 12, 'four corners, two at its gate, two along each other side');
  assert.ok(!inCastle.some((o) => o.type === 'city_tower'), 'only the intact castle towers');
  assert.equal(DAWNKEEP.structures.filter((s) => inRect(castle, s.col, s.row)).length, 0, 'no ruined blueprint houses in the citadel');
  assert.ok(DAWNKEEP.objects.some((o) => o.type === 'dk_church' && inRect(zone('church').area, o.col, o.row)), 'the church (with its bell tower)');
  assert.ok(DAWNKEEP.objects.filter((o) => o.type === 'tombstone').length >= 20, 'its graveyard');
  const plaza = zone('plaza').area;
  assert.ok(DAWNKEEP.objects.some((o) => o.type === 'dk_well' && inRect(plaza, o.col, o.row)));
  assert.ok(DAWNKEEP.objects.filter((o) => o.type === 'dk_market_stall' && inRect(plaza, o.col, o.row)).length >= 4);
  // enough open ground: the plaza is mostly free, and much of the town inside the walls is walkable
  let free = 0;
  for (let r = plaza.row; r < plaza.row + plaza.h; r++) for (let c = plaza.col; c < plaza.col + plaza.w; c++) if (!map.isTileBlocked(c, r)) free++;
  assert.ok(free / (plaza.w * plaza.h) > 0.85, 'the plaza stays open');
  let walk = 0;
  for (let r = 7; r < 89; r++) for (let c = 7; c < 89; c++) if (reached[r][c]) walk++;
  assert.ok(walk / (82 * 82) > 0.6, `walkable share inside the walls ${(walk / (82 * 82)).toFixed(2)}`);
});

test('Dawnkeep art: every sprite is on disk at its size, transparent, loaded with the map; mirrored walls share their file', () => {
  for (const [id, a] of Object.entries(DAWNKEEP_ART)) {
    const png = readPng(path.join(process.cwd(), 'public', DAWNKEEP_ART_BASE, a.file));
    assert.deepEqual([png.width, png.height], [a.width, a.height], id);
    assert.equal(png.data[3], 0, `${id}: transparent corner`);
    assert.ok(a.anchorX > 0 && a.anchorX < a.width && a.anchorY > 0 && a.anchorY < a.height, id);
    assert.ok(id in MAP_OBJECTS, id);
  }
  assert.equal(HANDMADE_OBJECT_ART.city_wall_y?.key, HANDMADE_OBJECT_ART.city_wall?.key);
  assert.equal(HANDMADE_OBJECT_ART.city_wall_y?.flipX, true);
  const keys = MAP_REGISTRY.dawnkeep.assets.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length, 'each file once');
  for (const id of [...Object.keys(DAWNKEEP_ART), 'city_wall', 'city_wall_broken', 'city_tower']) assert.ok(keys.includes(HANDMADE_OBJECT_ART[id as 'city_wall']!.key), id);
  assert.ok(!MAP_REGISTRY[ASHEN_CROSSROADS.id].assets.some((a) => a.key.startsWith('art_dk_')), 'Ashen does not load Dawnkeep');
});

test('warps: Ashen -> Dawnkeep arrival; Dawnkeep -> back to the road below the Ashen gate; the start map follows', () => {
  const to = PORTALS.dawnkeep_gate.destination;
  assert.deepEqual(to, { mapId: 'dawnkeep', ...DAWNKEEP_ARRIVAL });
  const back = PORTALS.dawnkeep_exit;
  assert.equal(back.mapId, 'dawnkeep');
  assert.ok(reached[back.tile.row][back.tile.col], 'the way back stands on the apron');
  const ashen = new MapLayout(ASHEN_CROSSROADS);
  assert.equal(back.destination.mapId, ASHEN_CROSSROADS.id);
  assert.ok(standable(ashen, back.destination.col, back.destination.row), 'lands on walkable ground in Ashen');
  assert.ok(!map.isTileBlocked(tileCentre(back.tile).x | 0, tileCentre(back.tile).y | 0));
  withoutStorage(() => {
    const c = newCharacter('Alpha');
    assert.equal(PortalService.state(c, 'dawnkeep_exit'), 'ENTERED', 'always open, no arrow');
    assert.equal(PortalService.unlock(c, 'dawnkeep_exit'), false);
  });
  assert.equal(startMapId({ mapId: 'dawnkeep' }), 'dawnkeep');
  assert.equal(startMapId({ savedLocation: { mapId: 'dawnkeep' } }), 'dawnkeep', 'a save made in Dawnkeep loads there');
  assert.equal(startMapId({ savedLocation: { mapId: 'nowhere' } }), DEFAULT_MAP_ID);
  assert.equal(startMapId({}), DEFAULT_MAP_ID);
});

test('portal positions: Ashen (14, 3), Dawnkeep (47, 91); both walkable; (46, 91) and (48, 91) blocked for walking and paths', () => {
  const ashen = new MapLayout(ASHEN_CROSSROADS);
  assert.deepEqual(PORTALS.dawnkeep_gate.tile, { col: 14, row: 3 });
  assert.deepEqual(PORTALS.dawnkeep_exit.tile, { col: 47, row: 91 });
  assert.ok(standable(ashen, 14, 3), 'the Ashen portal tile');
  assert.ok(standable(map, 47, 91) && reached[91][47], 'the Dawnkeep portal tile');
  for (const [c, r] of [
    [46, 91],
    [48, 91],
  ]) {
    assert.ok(map.isTileBlocked(c, r), `(${c}, ${r}) blocked`);
    assert.ok(!standable(map, c, r));
    assert.ok(!reached[r][c], 'never on a path');
  }
  // the blocked tiles are invisible: no prop stands there
  assert.ok(!DAWNKEEP.objects.some((o) => o.row === 91 && (o.col === 46 || o.col === 48)));
  // out of the gate the only way to the apron is over the portal tile
  const withoutPortalTile = new MapLayout({ ...DAWNKEEP, blocked: [...(DAWNKEEP.blocked ?? []), { col: 47, row: 91 }] });
  const r2 = reachable(withoutPortalTile, DAWNKEEP_ARRIVAL);
  assert.ok(!r2[93][47], 'the apron is reached only through (47, 91)');
});

test('warp destinations: both arrivals on safe ground, out of the other portal\'s reach; no warping straight back', () => {
  const ashen = new MapLayout(ASHEN_CROSSROADS);
  const back = PORTALS.dawnkeep_exit.destination;
  assert.deepEqual(back, { mapId: ASHEN_CROSSROADS.id, col: 14, row: 5 });
  assert.ok(standable(ashen, back.col, back.row));
  const dist = (a: { col: number; row: number }, b: { col: number; row: number }) => Math.hypot(a.col - b.col, a.row - b.row);
  assert.ok(dist(back, PORTALS.dawnkeep_gate.tile) > WARP_GUARD.reach, 'arriving in Ashen does not stand in its portal');
  assert.ok(dist(DAWNKEEP_ARRIVAL, PORTALS.dawnkeep_exit.tile) > WARP_GUARD.reach, 'arriving in Dawnkeep does not stand in its portal');
  // the guard: shut for a moment after an arrival; inside a portal's reach until the player stepped out once
  const g = arrivalGuard(1000, 5);
  assert.equal(warpAllowed(g, 1500), false);
  assert.equal(warpAllowed(g, 1000 + WARP_GUARD.ms), true);
  const near = arrivalGuard(0, 0.5);
  assert.equal(warpAllowed(near, 10_000), false, 'still on the portal');
  const left = updateWarpGuard(updateWarpGuard(near, 1.2), 2.5);
  assert.equal(warpAllowed(left, 10_000), true, 'stepped out of its reach once');
  assert.equal(warpAllowed(null, 0), true);
});

test('step-on warp: walking onto an open portal warps at once - not during Auto Play, not right after arriving, not twice', () => {
  const base = { wasOn: false, isOn: true, autoPlay: false, state: 'UNLOCKED' as const, allowed: true };
  assert.equal(stepWarps(base), true, 'walked onto it');
  assert.equal(stepWarps({ ...base, state: 'ENTERED' }), true, 'again later');
  assert.equal(stepWarps({ ...base, autoPlay: true }), false, 'Auto Play / Auto Combat running: no warp');
  assert.equal(stepWarps({ ...base, wasOn: true }), false, 'standing on it (e.g. after Auto Play stopped): step off and on again');
  assert.equal(stepWarps({ ...base, state: 'LOCKED' }), false, 'a locked (hidden) portal');
  assert.equal(stepWarps({ ...base, allowed: false }), false, 'the arrival guard');
  assert.equal(stepWarps({ ...base, isOn: false }), false);
  assert.ok(onPortalTile({ x: 47.9, y: 91.1 }, { col: 47, row: 91 }) && !onPortalTile({ x: 48.01, y: 91.5 }, { col: 47, row: 91 }));
  const game = fs.readFileSync(path.join(process.cwd(), 'src/scenes/GameScene.ts'), 'utf8');
  assert.ok(game.includes('autoPlay: AutoPlayService.isOn(this.character)'), 'GameScene asks Auto Play');
  assert.ok(game.includes('this.combat.moveTo(this.portal.position);'), 'a click on the portal only walks onto it');
  assert.ok(!game.includes('portalInteraction'), 'no click-to-use interaction left');
});

test('arrivals: the destination tile, 15 px to the right on screen, on safe ground and off every portal tile (both ways)', () => {
  const ashen = new MapLayout(ASHEN_CROSSROADS);
  const a = arrivalPoint({ col: 10, row: 10 });
  const dx = a.x - 10.5;
  const dy = a.y - 10.5;
  assert.ok(Math.abs((dx - dy) * 32 - ARRIVAL_OFFSET_PX) < 1e-9 && Math.abs((dx + dy) * 16) < 1e-9, '+15 px on screen x, 0 on y');
  assert.equal(ARRIVAL_OFFSET_PX, 15);
  const free = (m: MapLayout, p: { x: number; y: number }) => m.isAreaFree({ minX: p.x - PLAYER_RADIUS, minY: p.y - PLAYER_RADIUS, maxX: p.x + PLAYER_RADIUS, maxY: p.y + PLAYER_RADIUS });
  const intoDawnkeep = arrivalPoint(PORTALS.dawnkeep_gate.destination);
  const intoAshen = arrivalPoint(PORTALS.dawnkeep_exit.destination);
  assert.ok(free(map, intoDawnkeep), 'Dawnkeep arrival');
  assert.ok(free(ashen, intoAshen), 'Ashen arrival');
  assert.ok(!onPortalTile(intoDawnkeep, PORTALS.dawnkeep_exit.tile) && !onPortalTile(intoAshen, PORTALS.dawnkeep_gate.tile), 'never lands on a portal');
  const sheet = readPng(path.join(process.cwd(), 'public', PORTAL_ART.url));
  assert.deepEqual([sheet.width, sheet.height, PORTAL_ART.frames], [64 * 12, 64, 12]);
  assert.equal(PORTALS.dawnkeep_exit.art, PORTAL_ART, 'both portals use the animation');
  assert.equal(PORTALS.dawnkeep_gate.art, PORTAL_ART);
});
