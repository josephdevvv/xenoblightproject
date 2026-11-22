import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createCharacterData, type CharacterData } from '../src/data/CharacterData';
import { CharacterProfileStore } from '../src/data/CharacterProfileStore';
import { getDictionary } from '../src/i18n';
import { InventoryService } from '../src/inventory/InventoryService';
import { checksum, parseSave, SAVE_FILE_VERSION, SAVE_FORMAT, serializeSave } from '../src/save/SaveFile';
import { parseSavedLocation, placeSavedLocation } from '../src/save/SavedLocation';
import { SaveService } from '../src/save/SaveService';
import { CharacterStatusService } from '../src/status/CharacterStatusService';
import { MapLayout } from '../src/world/MapLayout';
import { ASHEN_CROSSROADS } from '../src/world/maps/AshenCrossroads';
import { DEFAULT_SPAWN_POINT_ID, respawnPoint, respawnTile, SPAWN_POINTS, spawnPoint } from '../src/world/SpawnPoints';

const MAP = ASHEN_CROSSROADS.id;
const START = { x: ASHEN_CROSSROADS.spawn.col + 0.5, y: ASHEN_CROSSROADS.spawn.row + 0.5 };
const layout = new MapLayout(ASHEN_CROSSROADS);
/** PLAYER_MOVEMENT.radius (PlayerController needs Phaser). */
const RADIUS = 0.22;

function withStorage(fn: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: unknown };
  const previous = g.localStorage;
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) };
  try {
    fn(store);
  } finally {
    g.localStorage = previous;
  }
}

function create(name: string): CharacterData {
  const c = createCharacterData(name, { gender: 'male', hairstyleId: 'mohawk' });
  CharacterProfileStore.save({ name: c.name, appearance: c.appearance, classId: c.classId, createdAt: c.createdAt });
  CharacterStatusService.loadInto(c);
  return c;
}

// ------------------------------------------------------------------------------------------ spawn point

test('spawn points: exactly one, the place new characters start, on walkable ground', () => {
  assert.equal(SPAWN_POINTS.length, 1);
  assert.deepEqual(SPAWN_POINTS[0], { id: DEFAULT_SPAWN_POINT_ID, mapId: MAP, tile: START });
  assert.deepEqual(START, { x: 14.5, y: 118.5 });
  assert.equal(respawnPoint(), SPAWN_POINTS[0]);
  assert.equal(spawnPoint(DEFAULT_SPAWN_POINT_ID), SPAWN_POINTS[0]);
  assert.equal(spawnPoint('spawn_town'), undefined);
  assert.ok(layout.isAreaFree({ minX: START.x - RADIUS, minY: START.y - RADIUS, maxX: START.x + RADIUS, maxY: START.y + RADIUS }));
});

test('respawn: always the spawn point; another map (later) falls back to the start of the map; always a copy', () => {
  assert.deepEqual(respawnTile(MAP, { x: 1, y: 1 }), START);
  assert.deepEqual(respawnTile('other_map', { x: 3.5, y: 4.5 }), { x: 3.5, y: 4.5 });
  // ready for more: the rule takes any registered point
  assert.deepEqual(respawnTile('town', { x: 1, y: 1 }, { id: 'spawn_town', mapId: 'town', tile: { x: 7.5, y: 8.5 } }), { x: 7.5, y: 8.5 });
  const p = respawnTile(MAP, { x: 1, y: 1 });
  p.x = 0;
  assert.deepEqual(respawnTile(MAP, { x: 1, y: 1 }), START);
});

// ------------------------------------------------------------------------------------------- save point

test('saved location: placed exactly where it was, only where one can stand on that map', () => {
  const at = { mapId: MAP, x: 18.5, y: 106.5 };
  assert.deepEqual(placeSavedLocation(at, MAP, layout, RADIUS), { x: 18.5, y: 106.5 });
  assert.equal(placeSavedLocation(null, MAP, layout, RADIUS), null);
  assert.equal(placeSavedLocation(at, 'other_map', layout, RADIUS), null);
  for (const [x, y] of [[-1, 5], [5, -1], [1e9, 5], [5, 1e9]]) assert.equal(placeSavedLocation({ mapId: MAP, x, y }, MAP, layout, RADIUS), null, `${x},${y}`);
  let blocked = 0;
  for (let col = 0; col < ASHEN_CROSSROADS.cols; col++) {
    for (let row = 0; row < ASHEN_CROSSROADS.rows; row++) {
      const free = layout.isAreaFree({ minX: col + 0.5 - RADIUS, minY: row + 0.5 - RADIUS, maxX: col + 0.5 + RADIUS, maxY: row + 0.5 + RADIUS });
      const placed = placeSavedLocation({ mapId: MAP, x: col + 0.5, y: row + 0.5 }, MAP, layout, RADIUS);
      assert.equal(placed !== null, free, `${col},${row}`);
      if (!free) blocked++;
    }
  }
  assert.ok(blocked > 50, 'walls and props were really checked');
  for (const raw of [null, 5, 'x', [], {}, { mapId: MAP }, { mapId: MAP, x: '1', y: 2 }, { mapId: MAP, x: Number.NaN, y: 2 }, { mapId: 4, x: 1, y: 2 }]) assert.equal(parseSavedLocation(raw), null);
});

// ----------------------------------------------------------------------------------------- independence

test('scenarios A, B, C: dying goes to the spawn point, loading goes to the save point, whatever happened before', () => {
  withStorage(() => {
    const c = create('Alpha');
    const A = { mapId: MAP, x: 18.5, y: 106.5 };
    const file = serializeSave(c, A);
    // A: save, move on, die
    assert.deepEqual(respawnTile(MAP, START), START);
    assert.notDeepEqual(respawnTile(MAP, START), { x: A.x, y: A.y });
    // B: load
    const load = () => {
      const r = parseSave(file);
      assert.ok(r.ok);
      assert.ok(SaveService.restore(r.save));
      return placeSavedLocation(r.save.savedLocation, MAP, layout, RADIUS);
    };
    assert.deepEqual(load(), { x: A.x, y: A.y });
    // C: loaded, died, respawned, loaded again
    assert.deepEqual(respawnTile(MAP, START), START);
    assert.deepEqual(load(), { x: A.x, y: A.y });
    assert.equal(serializeSave(c, A, 1), serializeSave(c, A, 1));
  });
});

test('the browser\'s own progress never contains a position: playing, saving and loading change no save point', () => {
  withStorage((store) => {
    const c = create('Alpha');
    const file = serializeSave(c, { mapId: MAP, x: 18.5, y: 106.5 });
    CharacterStatusService.gainExp(c, 100);
    InventoryService.grantOnce(c, { grantId: 'g', itemId: 'weapon_rusty_dagger', quantity: 1 });
    const r = parseSave(file);
    assert.ok(r.ok && SaveService.restore(r.save));
    for (const [key, value] of store) assert.ok(!/18\.5|106\.5|"(location|savedLocation|respawnLocation|mapId)"/.test(value), key);
    const again = parseSave(file);
    assert.ok(again.ok);
    assert.deepEqual(again.save.savedLocation, { mapId: MAP, x: 18.5, y: 106.5 });
  });
});

test('death and respawn code knows nothing about save files, and saving knows nothing about spawn points', () => {
  const src = path.join(process.cwd(), 'src');
  const read = (...files: string[]): string => files.map((f) => fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
  assert.ok(!/savedLocation|SavedLocation|SaveService|SaveFile|SavePoint/.test(read('player/death/PlayerDeathController.ts', 'player/death/PlayerLifeState.ts', 'combat/CombatSystem.ts', 'ui/death/DeathOverlay.ts')));
  assert.ok(!/from '.*SpawnPoints'|respawnTile|respawnPoint\(/.test(read('save/SaveFile.ts', 'save/SaveService.ts', 'save/SavedLocation.ts', 'scenes/MainMenuScene.ts')));
  assert.ok(!/SavedLocation|save\//.test(read('world/SpawnPoints.ts').replace(/\/\*\*[\s\S]*?\*\//g, '')));
});

test('save files written before this change still load with their position', () => {
  withStorage(() => {
    const c = create('Alpha');
    const { level, base, statPoints, exp } = c.status;
    // the version-1 document exactly as the game wrote it
    const d = { format: SAVE_FORMAT, version: 1, savedAt: 5, character: { name: c.name, appearance: c.appearance, classId: c.classId, createdAt: c.createdAt }, status: { level, base, statPoints, exp }, passives: c.passives, quests: c.quests, inventory: c.inventory, location: { mapId: MAP, x: 20.25, y: 107.5 } };
    const r = parseSave(JSON.stringify({ ...d, checksum: checksum(JSON.parse(JSON.stringify(d)) as Record<string, unknown>) }));
    assert.ok(r.ok);
    assert.deepEqual(r.save.savedLocation, { mapId: MAP, x: 20.25, y: 107.5 });
    assert.equal(SAVE_FILE_VERSION, 1);
    assert.deepEqual(Object.keys(JSON.parse(serializeSave(c, null)) as object).sort(), [...Object.keys(d), 'checksum'].sort(), 'same file format');
  });
});

test('death screen button', () => {
  assert.equal(getDictionary('th').death.respawn, 'เกิดใหม่ที่จุดเกิด');
  assert.equal(getDictionary('en').death.respawn, 'Respawn');
});
