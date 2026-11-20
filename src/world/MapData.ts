import type { TileCoord } from '../core/types';
import type { DecorTextureId, ObjectTextureId } from '../assets/TextureKeys';
import type { StructureType } from './structures/StructureBlueprints';
import type { WallRun } from './structures/StructureGeometry';

export type { WallRun } from './structures/StructureGeometry';

/** Paved surfaces. Everything not covered by a surface, vent or building is plain ground. */
export type SurfaceType = 'path' | 'cobble_broken' | 'plaza';

export interface MapRect {
  col: number;
  row: number;
  w: number;
  h: number;
  /** Default 'path' (intact cobbles). Later rects override earlier ones. */
  surface?: SurfaceType;
}

export interface MapObjectPlacement extends TileCoord {
  type: ObjectTextureId;
}

/** A multi-tile structure; (col, row) is the footprint's top (minimum) corner tile. */
export interface StructurePlacement extends TileCoord {
  type: StructureType;
}

/** Flat walkable ground detail (moss, cracks, debris). Position is the tile centre plus an offset. */
export interface DecorPlacement extends TileCoord {
  type: DecorTextureId;
  /** Offset from the tile centre in tiles (default 0). */
  dx?: number;
  dy?: number;
}

/** Seeded random ground details over an area (skips paved tiles, buildings and props). */
export interface DecorScatter {
  area: MapRect;
  /** Fraction of eligible tiles that get a detail (0..1). */
  density: number;
  types: DecorTextureId[];
}

/** Named area of the map (documentation, review overlays, validation). */
export interface MapZone {
  id: string;
  name: string;
  area: MapRect;
  /** A tile inside the zone that must be reachable from the spawn. */
  probe: TileCoord;
}

/**
 * Data-only map description. Later milestones can load the same shape from JSON / a map editor export.
 */
export interface MapDefinition {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Seed for picking ground tile variants and scattering details. */
  seed: number;
  paths: MapRect[];
  /** Smoking ground fissures (walkable). */
  vents: TileCoord[];
  objects: MapObjectPlacement[];
  structures: StructurePlacement[];
  walls?: WallRun[];
  decor?: DecorPlacement[];
  scatter?: DecorScatter[];
  zones?: MapZone[];
  spawn: TileCoord;
}
