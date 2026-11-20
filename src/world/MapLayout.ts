import type { ObjectTextureId } from '../assets/TextureKeys';
import type { Point, TileCoord } from '../core/types';
import type { DecorPlacement, MapDefinition, SurfaceType } from './MapData';
import { MAP_OBJECTS, type MapObjectSpec } from './objects/MapObjectCatalog';
import { STRUCTURE_BLUEPRINTS, type FloorType } from './structures/StructureBlueprints';
import { boxesOverlap, structurePieces, wallRunPieces, type PieceSpec, type TileBox } from './structures/StructureGeometry';

export type GroundType = 'ground' | SurfaceType | 'vent' | 'floor' | 'stone_floor' | 'rubble_floor';

const FLOOR_GROUND: Record<FloorType, GroundType> = { wood: 'floor', stone: 'stone_floor', rubble: 'rubble_floor' };

/** A placed prop (map-level or part of a building). (col, row) = minimum footprint tile. */
export interface ObjectInstance extends TileCoord {
  type: ObjectTextureId;
  spec: MapObjectSpec;
  /** Tile-space footprint box. */
  box: TileBox;
  /** Ground point the sprite stands on (footprint centre, tile space). */
  centre: Point;
}

/** Index of the structure (in definition.structures) whose footprint holds a tile, or -1. */
type StructureIndex = number;

/**
 * Pure map model: ground types, blocked tiles, props, wall pieces and collision - everything a map
 * needs except rendering. Shared by IsometricMap (game) and the navigation tests, so validation
 * checks exactly the collision the player experiences.
 *
 * Throws on invalid data (overlapping props / buildings, props outside the map, blocked spawn) so
 * a broken map fails at load time instead of producing invisible walls.
 */
export class MapLayout {
  readonly cols: number;
  readonly rows: number;
  readonly ground: GroundType[][];
  readonly objects: ObjectInstance[] = [];
  readonly pieces: PieceSpec[] = [];
  readonly decor: DecorPlacement[] = [];
  readonly footprints: TileBox[] = [];

  private readonly blocked: boolean[][];
  private readonly owner: StructureIndex[][];
  /** Coarse grid of solid pieces (cell = 4 x 4 tiles) for fast collision queries. */
  private readonly pieceGrid = new Map<number, PieceSpec[]>();

  constructor(readonly definition: MapDefinition) {
    const d = definition;
    this.cols = d.cols;
    this.rows = d.rows;
    this.ground = Array.from({ length: this.rows }, () => Array<GroundType>(this.cols).fill('ground'));
    this.blocked = Array.from({ length: this.rows }, () => Array<boolean>(this.cols).fill(false));
    this.owner = Array.from({ length: this.rows }, () => Array<StructureIndex>(this.cols).fill(-1));

    for (const r of d.paths) {
      for (let row = r.row; row < r.row + r.h; row++) {
        for (let col = r.col; col < r.col + r.w; col++) {
          if (this.isInside(col, row)) this.ground[row][col] = r.surface ?? 'path';
        }
      }
    }
    for (const v of d.vents) {
      if (this.isInside(v.col, v.row)) this.ground[v.row][v.col] = 'vent';
    }

    // Buildings: floor tiles, wall pieces, interior props.
    d.structures.forEach((s, index) => {
      const bp = STRUCTURE_BLUEPRINTS[s.type];
      const box: TileBox = { minX: s.col, minY: s.row, maxX: s.col + bp.width, maxY: s.row + bp.height };
      if (!this.isInside(box.minX, box.minY) || !this.isInside(box.maxX - 1, box.maxY - 1)) {
        throw new Error(`Map "${d.id}": structure ${s.type} at (${s.col}, ${s.row}) lies outside the map.`);
      }
      for (let row = box.minY; row < box.maxY; row++) {
        for (let col = box.minX; col < box.maxX; col++) {
          if (this.owner[row][col] !== -1) throw new Error(`Map "${d.id}": structures overlap at (${col}, ${row}).`);
          this.owner[row][col] = index;
          this.ground[row][col] = FLOOR_GROUND[bp.floor];
        }
      }
      this.footprints.push(box);
      this.pieces.push(...structurePieces(s.type, s.col, s.row));
      for (const p of bp.props ?? []) this.placeObject(p.type, s.col + p.x, s.row + p.y, index);
    });

    for (const run of d.walls ?? []) this.pieces.push(...wallRunPieces(run));

    for (const o of d.objects) this.placeObject(o.type, o.col, o.row, -1);

    for (const p of this.pieces) {
      if (!p.solid) continue;
      for (const key of this.cellsOf(p.box)) {
        const list = this.pieceGrid.get(key);
        if (list) list.push(p);
        else this.pieceGrid.set(key, [p]);
      }
    }

    this.decor.push(...(d.decor ?? []));
    this.scatterDecor();

    const { col, row } = d.spawn;
    if (!this.isInside(col, row) || this.blocked[row][col]) {
      throw new Error(`Map "${d.id}": spawn tile (${col}, ${row}) is outside the map or blocked.`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------------------------

  isInside(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  isTileBlocked(col: number, row: number): boolean {
    return !this.isInside(col, row) || this.blocked[row][col];
  }

  isWalkable(x: number, y: number): boolean {
    return !this.isTileBlocked(Math.floor(x), Math.floor(y));
  }

  /** The structure footprint containing a tile (index into definition.structures), or -1. */
  structureAt(col: number, row: number): number {
    return this.isInside(col, row) ? this.owner[row][col] : -1;
  }

  /**
   * Movement collision for a footprint box (smaller than one tile): blocked tiles are tested at the
   * four corners, thin walls and posts with a box-overlap test.
   */
  isAreaFree(box: TileBox): boolean {
    if (
      !this.isWalkable(box.minX, box.minY) ||
      !this.isWalkable(box.maxX, box.minY) ||
      !this.isWalkable(box.minX, box.maxY) ||
      !this.isWalkable(box.maxX, box.maxY)
    ) {
      return false;
    }
    return !this.collidesWithPiece(box);
  }

  collidesWithPiece(box: TileBox): boolean {
    for (const key of this.cellsOf(box)) {
      const list = this.pieceGrid.get(key);
      if (list && list.some((p) => boxesOverlap(box, p.box))) return true;
    }
    return false;
  }

  /** Deterministic per-tile random value in [0, 1) (stable when the map grows). */
  tileNoise(col: number, row: number, salt = 0): number {
    let h = (this.definition.seed ^ Math.imul(col + 1, 374761393) ^ Math.imul(row + 7, 668265263) ^ Math.imul(salt + 3, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // -------------------------------------------------------------------------------------------
  // Construction helpers
  // -------------------------------------------------------------------------------------------

  private placeObject(type: ObjectTextureId, col: number, row: number, structure: StructureIndex): void {
    const spec = MAP_OBJECTS[type];
    if (!spec) throw new Error(`Map "${this.definition.id}": unknown object type "${type}".`);
    for (let r = row; r < row + spec.h; r++) {
      for (let c = col; c < col + spec.w; c++) {
        if (!this.isInside(c, r)) throw new Error(`Map "${this.definition.id}": object ${type} at (${col}, ${row}) lies outside the map.`);
        if (this.owner[r][c] !== structure) {
          throw new Error(`Map "${this.definition.id}": object ${type} at (${col}, ${row}) overlaps a structure.`);
        }
        if (this.blocked[r][c]) throw new Error(`Map "${this.definition.id}": object ${type} at (${col}, ${row}) overlaps another object.`);
      }
    }
    if (spec.category === 'blocking') {
      for (let r = row; r < row + spec.h; r++) for (let c = col; c < col + spec.w; c++) this.blocked[r][c] = true;
    }
    this.objects.push({
      type,
      col,
      row,
      spec,
      box: { minX: col, minY: row, maxX: col + spec.w, maxY: row + spec.h },
      centre: { x: col + spec.w / 2, y: row + spec.h / 2 },
    });
  }

  private scatterDecor(): void {
    const taken = new Set(this.decor.map((p) => p.row * this.cols + p.col));
    (this.definition.scatter ?? []).forEach((s, si) => {
      const a = s.area;
      for (let row = a.row; row < a.row + a.h; row++) {
        for (let col = a.col; col < a.col + a.w; col++) {
          if (!this.isInside(col, row) || this.blocked[row][col] || this.owner[row][col] !== -1) continue;
          if (taken.has(row * this.cols + col)) continue;
          if (this.tileNoise(col, row, 11 + si) >= s.density) continue;
          const pick = s.types[Math.floor(this.tileNoise(col, row, 23 + si) * s.types.length)];
          // Keep roads readable: only small, flat details on paved tiles.
          const paved = this.ground[row][col] !== 'ground';
          if (paved && pick !== 'moss' && pick !== 'tile_shards') continue;
          taken.add(row * this.cols + col);
          this.decor.push({
            type: pick,
            col,
            row,
            dx: (this.tileNoise(col, row, 31) - 0.5) * 0.5,
            dy: (this.tileNoise(col, row, 37) - 0.5) * 0.5,
          });
        }
      }
    });
  }

  private *cellsOf(box: TileBox): Generator<number> {
    const c0 = Math.floor(box.minX / 4);
    const c1 = Math.floor(box.maxX / 4);
    const r0 = Math.floor(box.minY / 4);
    const r1 = Math.floor(box.maxY / 4);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) yield (r + 8) * 4096 + (c + 8);
  }
}
