import type { Point } from '../core/types';
import { ASHEN_CROSSROADS } from './maps/AshenCrossroads';

/**
 * Spawn points: where the player RESPAWNS after death - nothing else. (Where a manually saved game continues
 * is the save file's savedLocation, src/save/SavedLocation; neither ever reads or changes the other.)
 *
 * Exactly one exists: the place new characters start. More (towns) can be added to the registry later; which
 * one a character uses is decided in one place, respawnPoint().
 */
export interface SpawnPoint {
  readonly id: string;
  readonly mapId: string;
  /** Tile space (tile centre = col + 0.5). */
  readonly tile: Readonly<Point>;
}

export const DEFAULT_SPAWN_POINT_ID = 'spawn_ashen_crossroads_start';

/** The map's own player start, so the two can never differ. */
export const SPAWN_POINTS: readonly SpawnPoint[] = [
  { id: DEFAULT_SPAWN_POINT_ID, mapId: ASHEN_CROSSROADS.id, tile: { x: ASHEN_CROSSROADS.spawn.col + 0.5, y: ASHEN_CROSSROADS.spawn.row + 0.5 } },
];

export function spawnPoint(id: string): SpawnPoint | undefined {
  return SPAWN_POINTS.find((s) => s.id === id);
}

/** The spawn point of the player. Current rule: always the default one. */
export function respawnPoint(): SpawnPoint {
  return spawnPoint(DEFAULT_SPAWN_POINT_ID)!;
}

/**
 * Where the player respawns on the map they died on. (Respawning onto another map is not supported yet - there
 * is only one: a spawn point elsewhere falls back to this map's own start.)
 */
export function respawnTile(currentMapId: string, mapStart: Point, point: SpawnPoint = respawnPoint()): Point {
  return point.mapId === currentMapId ? { x: point.tile.x, y: point.tile.y } : { x: mapStart.x, y: mapStart.y };
}
