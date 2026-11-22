import type { Point } from '../core/types';
import type { TileBox } from '../world/structures/StructureGeometry';

/**
 * Save point: where the player stood when they saved the game by hand. It exists only inside the exported save
 * file and is used only when that file is loaded. Death and respawn never read or change it (see
 * world/SpawnPoints).
 */
export interface SavedLocation {
  mapId: string;
  /** Tile space. */
  x: number;
  y: number;
}

/** File data -> location (null = none / unusable). Whether one can stand there is decided by the map. */
export function parseSavedLocation(raw: unknown): SavedLocation | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { mapId, x, y } = raw as Partial<Record<keyof SavedLocation, unknown>>;
  if (typeof mapId !== 'string' || typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { mapId, x, y };
}

/** The parts of a map this needs. */
export interface StandableMap {
  isInside(col: number, row: number): boolean;
  isAreaFree(box: TileBox): boolean;
}

/** The position to continue at, or null when the player cannot stand there on this map. */
export function placeSavedLocation(saved: SavedLocation | null, mapId: string, map: StandableMap, radius: number): Point | null {
  if (!saved || saved.mapId !== mapId || !map.isInside(Math.floor(saved.x), Math.floor(saved.y))) return null;
  const { x, y } = saved;
  return map.isAreaFree({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius }) ? { x, y } : null;
}
