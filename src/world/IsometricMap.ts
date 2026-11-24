import Phaser from 'phaser';
import { DEPTH, TILE_HALF_WIDTH, TILE_HEIGHT, TILE_SIDE_HEIGHT, TILE_WIDTH } from '../config/constants';
import { TextureKeys } from '../assets/TextureKeys';
import { getDecorArt } from '../assets/mockup/MockupRuinFactory';
import type { Point, TileCoord } from '../core/types';
import { IsoProjection } from './IsoProjection';
import type { MapDefinition } from './MapData';
import { MapLayout, type GroundType } from './MapLayout';
import { OBSTACLES, type ObstacleDefinition } from './ObstacleCatalog';
import { StructureLayer, type TileBox } from './structures/StructureLayer';

/** Extra empty space around the diamond so the camera can show the map edges. */
const WORLD_MARGIN = 160;

export interface PlacedObstacle extends TileCoord {
  definition: ObstacleDefinition;
  /** Ground point the sprite stands on (footprint centre). */
  world: Point;
  box: TileBox;
}

/**
 * Isometric tile map: renders ground tiles, props and structures into a scene and answers collision /
 * coordinate queries. The data model (ground, blocked tiles, props, wall boxes) is MapLayout - pure,
 * so navigation can be validated in tests with the same rules.
 */
export class IsometricMap {
  readonly cols: number;
  readonly rows: number;
  readonly projection: IsoProjection;
  readonly layout: MapLayout;
  readonly obstacles: PlacedObstacle[] = [];
  readonly structures: StructureLayer;

  private readonly staticImages: Phaser.GameObjects.Image[] = [];

  constructor(readonly definition: MapDefinition) {
    this.layout = new MapLayout(definition);
    this.cols = definition.cols;
    this.rows = definition.rows;
    // Tile (0, rows-1)'s left corner lands at x = WORLD_MARGIN.
    this.projection = new IsoProjection(WORLD_MARGIN + this.rows * TILE_HALF_WIDTH, WORLD_MARGIN);
    this.structures = new StructureLayer(this.projection, definition.structures, this.layout.pieces);
    for (const o of this.layout.objects) {
      this.obstacles.push({ col: o.col, row: o.row, definition: OBSTACLES[o.type], world: this.projection.tileToWorld(o.centre.x, o.centre.y), box: o.box });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------------------------

  isInside(col: number, row: number): boolean {
    return this.layout.isInside(col, row);
  }

  isTileBlocked(col: number, row: number): boolean {
    return this.layout.isTileBlocked(col, row);
  }

  /** Continuous tile-space point query. Outside the map counts as blocked. */
  isWalkable(x: number, y: number): boolean {
    return this.layout.isWalkable(x, y);
  }

  /** Movement collision for a footprint box (see MapLayout.isAreaFree). */
  isAreaFree(box: TileBox): boolean {
    return this.layout.isAreaFree(box);
  }

  /** Depth for a character, corrected against walls and large props (see StructureLayer). */
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
   * Incremental build: ground tiles (back-to-front), ground details, props (depth-sorted by screen Y),
   * structures. Yields progress (0..1) after each tile diagonal / group so a time-sliced runner can
   * spread object creation over several frames. The visual result is identical to a one-shot build.
   */
  *buildSteps(scene: Phaser.Scene): Generator<number> {
    const layer = scene.add.layer();
    layer.setDepth(DEPTH.Ground);
    const diagonals = this.cols + this.rows - 1;
    const totalSteps = diagonals + 3;
    const ground = this.layout.ground;

    // Draw diagonals in increasing (col + row) so nearer tiles cover the sides of farther ones.
    for (let sum = 0; sum < diagonals; sum++) {
      for (let col = 0; col < this.cols; col++) {
        const row = sum - col;
        if (row < 0 || row >= this.rows) continue;
        const top = this.projection.tileToWorld(col, row);
        const key = this.pickTileTexture(ground[row][col], this.layout.tileNoise(col, row));
        const image = scene.make.image({ x: top.x - TILE_WIDTH / 2, y: top.y, key }, false);
        image.setOrigin(0, 0);
        layer.add(image);
        this.staticImages.push(image);
      }
      yield (sum + 1) / totalSteps;
    }

    // Flat ground details: on the ground layer, under every prop and character.
    for (const d of this.layout.decor) {
      const art = getDecorArt(scene.textures, d.type);
      const pos = this.projection.tileToWorld(d.col + 0.5 + (d.dx ?? 0), d.row + 0.5 + (d.dy ?? 0));
      const image = scene.make.image({ x: Math.round(pos.x), y: Math.round(pos.y), key: art.key }, false);
      image.setOrigin(art.originX, art.originY);
      if (this.layout.tileNoise(d.col, d.row, 5) < 0.5 && art.flippable) image.setFlipX(true);
      layer.add(image);
      this.staticImages.push(image);
    }
    yield (diagonals + 1) / totalSteps;

    for (const o of this.obstacles) {
      const image = scene.add.image(Math.round(o.world.x), Math.round(o.world.y), o.definition.textureKey);
      image.setOrigin(o.definition.originX, o.definition.originY);
      if (o.definition.flipX) image.setFlipX(true);
      if (o.definition.spec.w > 1 || o.definition.spec.h > 1 || o.definition.spec.tall) {
        // Large / tall props sort (and fade) against characters like walls do.
        this.structures.register(image, o.box, o.definition.spec.tall);
      } else {
        image.setDepth(o.world.y);
        this.staticImages.push(image);
      }
    }
    yield (diagonals + 2) / totalSteps;

    this.structures.build(scene, layer);
    yield 1;
  }

  /**
   * Static, never-moving images created by the build (ground tiles, details and small props). Safe to
   * hide when off-screen; walls and large props are excluded because they fade dynamically.
   */
  getStaticImages(): readonly Phaser.GameObjects.Image[] {
    return this.staticImages;
  }

  private pickTileTexture(type: GroundType, r: number): string {
    const pick = (keys: readonly string[]): string => keys[Math.min(keys.length - 1, Math.floor(r * keys.length))];
    switch (type) {
      case 'vent':
        return TextureKeys.ventTile;
      case 'floor':
        return TextureKeys.floorTiles[r < 0.7 ? 0 : 1];
      case 'stone_floor':
        return TextureKeys.stoneFloorTiles[r < 0.88 ? 0 : 1];
      case 'rubble_floor':
        return pick(TextureKeys.rubbleFloorTiles);
      case 'path':
        return pick(TextureKeys.pathTiles);
      case 'cobble_broken':
        // mostly broken stones, some intact cobbles
        return r < 0.3 ? TextureKeys.pathTiles[Math.floor(r * 10) % 3] : pick(TextureKeys.brokenCobbleTiles);
      case 'plaza':
        return r < 0.8 ? TextureKeys.plazaTiles[0] : r < 0.9 ? TextureKeys.plazaTiles[1] : TextureKeys.plazaTiles[2];
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

