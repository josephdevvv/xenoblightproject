import type { Point } from '../core/types';

/**
 * Save points (respawn locations). No save-point objects exist in the world yet, so characters have no
 * saved point and every respawn uses the map's default spawn - the fallback below. When save points are
 * added (bound at a shrine / NPC and stored with the character) they plug in here.
 */
export interface SavePoint {
  mapId: string;
  /** Tile-space position (tile centre = col + 0.5). */
  tile: Point;
}

/**
 * Where the player respawns: their save point on this map, otherwise the map's default spawn.
 * (Respawning onto another map is not supported yet: a save point elsewhere falls back as well.)
 */
export function resolveRespawnPoint(saved: SavePoint | null | undefined, currentMapId: string, mapSpawn: Point): Point {
  if (saved && saved.mapId === currentMapId && Number.isFinite(saved.tile.x) && Number.isFinite(saved.tile.y)) return { ...saved.tile };
  return { ...mapSpawn };
}
