import Phaser from 'phaser';
import { DEPTH, TILE_HALF_WIDTH, TILE_HEIGHT, TILE_SIDE_HEIGHT, TILE_WIDTH } from '../config/constants';
import { TextureKeys } from '../assets/TextureKeys';
import { createRng } from '../assets/mockup/PixelCanvas';
import type { Point, TileCoord } from '../core/types';
import { IsoProjection } from './IsoProjection';
import type { MapDefinition } from './MapData';
import { OBSTACLES, type ObstacleDefinition } from './ObstacleCatalog';
import { StructureLayer, type TileBox } from './structures/StructureLayer';

type GroundType = 'ground' | 'path' | 'vent' | 'floor';

/** Extra empty space around the diamond so the camera can show the map edges. */
const WORLD_MARGIN = 160;

export interface PlacedObstacle extends TileCoord {
  definition: ObstacleDefinition;
  world: Point;
}

/**
 * Isometric tile map: owns the tile grid, collision data and coordinate conversion,
 * and renders ground tiles + props into a scene.
 */
export class IsometricMap {
  readonly cols: number;
  readonly rows: number;
  readonly projection: IsoProjection;
  readonly obstacles: PlacedObstacle[] = [];
  readonly structures: StructureLayer;

  private readonly staticImages: Phaser.GameObjects.Image[] = [];
  private readonly ground: GroundType[][];
  private readonly blocked: boolean[][];

  constructor(readonly definition: MapDefinition) {
    this.cols = definition.cols;
    this.rows = definition.rows;
    // Tile (0, rows-1)'s left corner lands at x = WORLD_MARGIN.
    this.projection = new IsoProjection(WORLD_MARGIN + this.rows * TILE_HALF_WIDTH, WORLD_MARGIN);

    this.ground = Array.from({ length: this.rows }, () => Array<GroundType>(this.cols).fill('ground'));
    this.blocked = Array.from({ length: this.rows }, () => Array<boolean>(this.cols).fill(false));

    for (const r of definition.paths) {
      for (let row = r.row; row < r.row + r.h; row++) {
        for (let col = r.col; col < r.col + r.w; col++) {
          if (this.isInside(col, row)) this.ground[row][col] = 'path';
        }
      }
    }
    for (const v of definition.vents) {
      if (this.isInside(v.col, v.row)) this.ground[v.row][v.col] = 'vent';
    }
    this.structures = new StructureLayer(this.projection, definition.structures);
    const footprints = this.structures.footprints();
    for (const f of footprints) {
      if (!this.isInside(f.minX, f.minY) || !this.isInside(f.maxX - 1, f.maxY - 1)) {
        throw new Error(`Map "${definition.id}": a structure footprint lies outside the map.`);
      }
      for (let row = f.minY; row < f.maxY; row++) {
        for (let col = f.minX; col < f.maxX; col++) this.ground[row][col] = 'floor';
      }
    }

    for (const o of definition.objects) {
      if (!this.isInside(o.col, o.row)) continue;
      const inside = footprints.some((f) => o.col >= f.minX && o.col < f.maxX && o.row >= f.minY && o.row < f.maxY);
      if (inside) {
        throw new Error(`Map "${definition.id}": object ${o.type} at (${o.col}, ${o.row}) overlaps a structure.`);
      }
      const def = OBSTACLES[o.type];
      this.obstacles.push({ col: o.col, row: o.row, definition: def, world: this.projection.tileCenter(o.col, o.row) });
      if (def.blocksMovement) this.blocked[o.row][o.col] = true;
    }

    const { col, row } = definition.spawn;
    if (!this.isInside(col, row) || this.blocked[row][col]) {
      throw new Error(`Map "${definition.id}": spawn tile (${col}, ${row}) is outside the map or blocked.`);
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

  /** Continuous tile-space point query. Outside the map counts as blocked. */
  isWalkable(x: number, y: number): boolean {
    return !this.isTileBlocked(Math.floor(x), Math.floor(y));
  }

  /**
   * Movement collision for a footprint box (smaller than one tile): blocked tiles are tested at the
   * four corners, thin structure walls with a box-overlap test.
   */
  isAreaFree(box: TileBox): boolean {
    return (
      this.isWalkable(box.minX, box.minY) &&
      this.isWalkable(box.maxX, box.minY) &&
      this.isWalkable(box.minX, box.maxY) &&
      this.isWalkable(box.maxX, box.maxY) &&
      !this.structures.collides(box)
    );
  }

  /** Depth for a character, corrected against structure walls (see StructureLayer). */
  resolveDepth(box: TileBox, naturalDepth: number, screenRect: Phaser.Geom.Rectangle): number {
    return this.structures.resolveDepth(box, naturalDepth, screenRect);
  }

  updateOcclusion(box: TileBox, screenRect: Phaser.Geom.Rectangle, deltaMs: number): void {
    this.structures.updateOcclusion(box, screenRect, deltaMs);
  }

  tileToWorld(x: number, y: number): Point {
    return this.projection.tileToWorld(x, y);
  }

  worldToTile(x: number, y: number): Point {
    return this.projection.worldToTile(x, y);
  }

  /** Spawn point in continuous tile space (centre of the spawn tile). */
  getSpawnPoint(): Point {
    return { x: this.definition.spawn.col + 0.5, y: this.definition.spawn.row + 0.5 };
  }

  getWorldBounds(): Phaser.Geom.Rectangle {
    const width = (this.cols + this.rows) * TILE_HALF_WIDTH + WORLD_MARGIN * 2;
    const height = ((this.cols + this.rows) * TILE_HEIGHT) / 2 + TILE_SIDE_HEIGHT + WORLD_MARGIN * 2;
    return new Phaser.Geom.Rectangle(0, 0, width, height);
  }

  /** World positions that should emit smoke (vents, smoking props, chimneys). Call after build(). */
  getSmokeSources(): Point[] {
    const points: Point[] = [];
    for (const v of this.definition.vents) points.push(this.projection.tileCenter(v.col, v.row));
    for (const o of this.obstacles) {
      if (o.definition.smokeOffsetY !== undefined) {
        points.push({ x: o.world.x, y: o.world.y + o.definition.smokeOffsetY });
      }
    }
    points.push(...this.structures.getSmokeSources());
    return points;
  }

  // -------------------------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------------------------

  /** Renders the whole map in one go (kept for compatibility; prefer buildSteps via MapLoadingManager). */
  build(scene: Phaser.Scene): void {
    const steps = this.buildSteps(scene);
    while (!steps.next().done) {
      // drain synchronously
    }
  }

  /**
   * Incremental build: ground tiles (back-to-front), props (depth-sorted by screen Y), structures.
   * Yields progress (0..1) after each tile diagonal / prop group so a time-sliced runner can spread
   * object creation over several frames. The visual result is identical to a one-shot build.
   */
  *buildSteps(scene: Phaser.Scene): Generator<number> {
    const layer = scene.add.layer();
    layer.setDepth(DEPTH.Ground);
    const rng = createRng(this.definition.seed);
    const diagonals = this.cols + this.rows - 1;
    const totalSteps = diagonals + 2;

    // Draw diagonals in increasing (col + row) so nearer tiles cover the sides of farther ones.
    for (let sum = 0; sum < diagonals; sum++) {
      for (let col = 0; col < this.cols; col++) {
        const row = sum - col;
        if (row < 0 || row >= this.rows) continue;
        const top = this.projection.tileToWorld(col, row);
        const key = this.pickTileTexture(this.ground[row][col], rng);
        const image = scene.make.image({ x: top.x - TILE_WIDTH / 2, y: top.y, key }, false);
        image.setOrigin(0, 0);
        layer.add(image);
        this.staticImages.push(image);
      }
      yield (sum + 1) / totalSteps;
    }

    for (const o of this.obstacles) {
      const image = scene.add.image(o.world.x, o.world.y, o.definition.textureKey);
      image.setOrigin(o.definition.originX, o.definition.originY);
      image.setDepth(o.world.y);
      this.staticImages.push(image);
    }
    yield (diagonals + 1) / totalSteps;

    this.structures.build(scene, layer);
    yield 1;
  }

  /**
   * Static, never-moving images created by the build (ground tiles and props). Safe to hide when
   * off-screen; structure walls are excluded because they fade dynamically.
   */
  getStaticImages(): readonly Phaser.GameObjects.Image[] {
    return this.staticImages;
  }

  private pickTileTexture(type: GroundType, rng: () => number): string {
    const r = rng();
    switch (type) {
      case 'vent':
        return TextureKeys.ventTile;
      case 'floor':
        return TextureKeys.floorTiles[r < 0.7 ? 0 : 1];
      case 'path':
        return TextureKeys.pathTiles[Math.floor(r * TextureKeys.pathTiles.length)];
      case 'ground': {
        // Mostly plain ground with occasional detail variants.
        const g = TextureKeys.groundTiles;
        if (r < 0.55) return g[0];
        if (r < 0.75) return g[1];
        if (r < 0.88) return g[2];
        return g[3];
      }
    }
  }
}
