import { TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from '../config/constants';
import type { Point } from '../core/types';

/**
 * 2:1 diamond isometric projection.
 *
 * Tile space: continuous (x, y) where tile (col, row) covers [col, col+1) x [row, row+1).
 * +x runs down-right on screen, +y runs down-left. The top corner of tile (0, 0) sits at `origin`.
 *
 *   worldX = originX + (x - y) * TILE_W/2
 *   worldY = originY + (x + y) * TILE_H/2
 */
export class IsoProjection {
  constructor(
    readonly originX: number,
    readonly originY: number,
  ) {}

  tileToWorld(x: number, y: number): Point {
    return {
      x: this.originX + (x - y) * TILE_HALF_WIDTH,
      y: this.originY + (x + y) * TILE_HALF_HEIGHT,
    };
  }

  worldToTile(worldX: number, worldY: number): Point {
    const a = (worldX - this.originX) / TILE_HALF_WIDTH; // x - y
    const b = (worldY - this.originY) / TILE_HALF_HEIGHT; // x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  /** World position of a tile's centre (where props and characters stand). */
  tileCenter(col: number, row: number): Point {
    return this.tileToWorld(col + 0.5, row + 0.5);
  }
}
