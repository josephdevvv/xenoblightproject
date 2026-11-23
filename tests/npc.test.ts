import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { IdleCycle } from '../src/npcs/IdleCycle';
import { NPC_DEFINITIONS, npcsOnMap, type NpcDefinition } from '../src/npcs/NpcDefinition';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { readPng } from './helpers/png';

const guard = NPC_DEFINITIONS.city_guard_01;
const ALL: NpcDefinition[] = Object.values(NPC_DEFINITIONS);
const DELIVERED: Record<string, string> = {
  city_guard_01: 'art-source/npcs/city_guard_01/MateusIdleAnimation.png',
  city_guard_jack: 'art-source/npcs/city_guard_jack/DoorGuard01IdleAnimation.png',
  city_guard_sonny: 'art-source/npcs/city_guard_sonny/DoorGuard02IdleAnimation.png',
  roland_01: 'art-source/npcs/roland_01/NPCRolandIdleAnimation.png',
};

function standsFree(def: NpcDefinition): boolean {
  const map = new MapLayout(ASHEN_CROSSROADS);
  const r = 0.22;
  const c = { x: def.tile.col + 0.5, y: def.tile.row + 0.5 };
  return map.isAreaFree({ minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r }) && map.structureAt(def.tile.col, def.tile.row) === -1;
}

test('City Guard Mateus: same id, named Mateus, block (14, 105) facing SW, on a standable tile of the first map', () => {
  assert.equal(guard.id, 'city_guard_01');
  assert.equal(guard.name, 'Mateus');
  assert.equal(guard.mapId, ASHEN_CROSSROADS.id);
  assert.deepEqual(guard.tile, { col: 14, row: 105 });
  assert.equal(guard.facing, 'SW');
  const map = new MapLayout(ASHEN_CROSSROADS);
  const r = 0.22;
  const c = { x: guard.tile.col + 0.5, y: guard.tile.row + 0.5 };
  assert.ok(map.isAreaFree({ minX: c.x - r, minY: c.y - r, maxX: c.x + r, maxY: c.y + r }), 'stands on open ground');
  assert.equal(map.structureAt(guard.tile.col, guard.tile.row), -1);
});

test('idle routine: frame 1 for 15 s, frames 2-13 once at 150 ms, back to frame 1, then again', () => {
  const meta = guard.art.meta;
  const c = new IdleCycle(guard.idle.stillMs, guard.idle.frameMs, meta.standFrame, meta.playFrames);
  assert.equal(guard.idle.stillMs, 15000);
  assert.equal(guard.idle.frameMs, 150);
  assert.equal(meta.standFrame, 0, 'frame 1 (sheet index 0) is the standing pose');
  assert.deepEqual(meta.playFrames, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'frames 2-13 (indices 1-12), row-major');
  assert.equal(c.frame(), 0);
  assert.equal(c.update(14999), 0);
  assert.equal(c.getPhase(), 'still', 'still for the whole first 15 s');
  assert.equal(c.update(1), 1, 'then frame 2');
  const seen: number[] = [c.frame()];
  for (let i = 0; i < 11; i++) seen.push(c.update(150));
  assert.deepEqual(seen, meta.playFrames, 'frames 2..13 in order, 150 ms each');
  assert.equal(c.update(149), 12);
  assert.equal(c.update(1), 0, 'back to frame 1 after one play');
  assert.equal(c.getPhase(), 'still');
  assert.equal(c.getPlays(), 1);
  // the 15 s countdown starts after the animation
  assert.equal(c.update(14999), 0);
  c.update(1);
  assert.equal(c.getPhase(), 'playing');
  assert.equal(c.getPlays(), 2);
});

test('idle routine: one cycle = 16.8 s, no overlapping plays even with huge frame gaps', () => {
  const frames = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const c = new IdleCycle(15000, 150, 0, frames);
  const steps = [40000, ...Array<number>(500).fill(256)];
  let t = 0;
  for (const s of steps) {
    c.update(s);
    t += s;
  }
  assert.equal(c.getPlays(), Math.floor((t - 15000) / 16800) + 1);
  const d = new IdleCycle(15000, 150, 0, frames);
  d.update(15000 + 1800 + 15000 + 75);
  assert.equal(d.getPlays(), 2);
  assert.equal(d.getPhase(), 'playing');
  assert.equal(d.frame(), 1);
});

for (const def of ALL) {
  test(`${def.name} art: ${def.art.meta.file} unchanged, 64 x 64 frames, the used ones on one feet row, the rest empty`, () => {
    const meta = def.art.meta;
    const delivered = path.join(process.cwd(), DELIVERED[def.id]);
    const shipped = path.join(process.cwd(), 'public', def.art.url);
    assert.ok(def.art.url.endsWith(meta.file));
    assert.ok(fs.readFileSync(shipped).equals(fs.readFileSync(delivered)), 'byte-identical to the delivered file');
    const img = readPng(shipped);
    const grid = def.id === 'roland_01' ? 5 : 4;
    const used = def.id === 'roland_01' ? 25 : 13;
    assert.equal(img.width, 64 * grid);
    assert.equal(img.height, 64 * grid);
    assert.equal(meta.frameWidth, 64);
    assert.equal(meta.frameHeight, 64);
    assert.equal(meta.columns, grid);
    assert.equal(meta.standFrame, 0);
    assert.deepEqual(meta.playFrames, Array.from({ length: used - 1 }, (_, i) => i + 1), 'frame 1 stands, the others play once in order');
    const bottomOf = (i: number): number => {
      const cx = (i % grid) * 64;
      const cy = Math.floor(i / grid) * 64;
      let b = -1;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (img.data[((cy + y) * img.width + cx + x) * 4 + 3] >= 128) b = y;
      return b;
    };
    for (const i of [meta.standFrame, ...meta.playFrames]) assert.equal(bottomOf(i) + 1, meta.anchor.y, `frame ${i + 1} stands on the anchor row`);
    for (let i = used; i < grid * grid; i++) assert.equal(bottomOf(i), -1, `frame ${i + 1} is empty and unused`);
  });
}

test('gate guards Jack (13, 3) and Sonny (16, 3): stable ids, standable tiles, Mateus idle routine', () => {
  const jack = NPC_DEFINITIONS.city_guard_jack;
  const sonny = NPC_DEFINITIONS.city_guard_sonny;
  assert.equal(jack.id, 'city_guard_jack');
  assert.equal(jack.name, 'Jack');
  assert.deepEqual(jack.tile, { col: 13, row: 3 });
  assert.equal(jack.art.meta.file, 'DoorGuard01IdleAnimation.png');
  assert.equal(sonny.id, 'city_guard_sonny');
  assert.equal(sonny.name, 'Sonny');
  assert.deepEqual(sonny.tile, { col: 16, row: 3 });
  assert.equal(sonny.art.meta.file, 'DoorGuard02IdleAnimation.png');
  for (const def of [jack, sonny]) {
    assert.equal(def.mapId, ASHEN_CROSSROADS.id);
    assert.ok(standsFree(def), `${def.name} stands on open ground`);
    assert.deepEqual(def.idle, guard.idle, 'same timing as Mateus');
  }
  // Mateus unchanged
  assert.equal(guard.name, 'Mateus');
  assert.deepEqual(guard.tile, { col: 14, row: 105 });
  assert.equal(guard.art.meta.file, 'MateusIdleAnimation.png');
  assert.deepEqual(guard.art.meta.anchor, { x: 36, y: 55, top: 6 });
  // one NPC per tile, all on the first map, distinct texture keys
  assert.equal(npcsOnMap(ASHEN_CROSSROADS.id).length, 4, 'Mateus, Jack, Sonny, Roland');
  assert.equal(new Set(ALL.map((n) => `${n.tile.col},${n.tile.row}`)).size, ALL.length);
  assert.equal(new Set(ALL.map((n) => n.art.meta.id)).size, ALL.length);
});
