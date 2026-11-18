import Phaser from 'phaser';
import type { Point } from '../../core/types';
import { getDecalTexture, getPostTexture, getWallTexture } from '../../assets/mockup/MockupStructureFactory';
import type { IsoProjection } from '../IsoProjection';
import type { StructurePlacement } from '../MapData';
import { STRUCTURE_BLUEPRINTS, type StructureBlueprint } from './StructureBlueprints';

/** Axis-aligned box in continuous tile space. */
export interface TileBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Piece {
  box: TileBox;
  image: Phaser.GameObjects.Image;
  /** Static depth (screen Y of the box centre). */
  depth: number;
  bounds: Phaser.Geom.Rectangle;
  /** Only pieces tall enough to hide a character fade out. */
  canFade: boolean;
}

const EPSILON = 0.001;
const FADED_ALPHA = 0.32;
const FADE_SPEED = 9;

/**
 * Owns every walk-in structure on a map.
 *
 * Why not one big sprite per building? A single image has a single depth, so a character could never be
 * inside it and in front of the back wall but behind the front wall at the same time. Instead each wall
 * piece is a separate sprite with a thin collision box, and characters get their depth corrected against
 * nearby pieces with a separating-axis test in tile space (see `resolveDepth`).
 */
export class StructureLayer {
  private readonly pieces: Piece[] = [];
  private readonly smoke: Point[] = [];

  constructor(
    private readonly projection: IsoProjection,
    private readonly placements: StructurePlacement[],
  ) {}

  /** Footprint tiles of all structures (for floor tiles and validation). */
  footprints(): TileBox[] {
    return this.placements.map((p) => {
      const bp = STRUCTURE_BLUEPRINTS[p.type];
      return { minX: p.col, minY: p.row, maxX: p.col + bp.width, maxY: p.row + bp.height };
    });
  }

  build(scene: Phaser.Scene, groundLayer: Phaser.GameObjects.Layer): void {
    for (const placement of this.placements) {
      this.buildOne(scene, groundLayer, STRUCTURE_BLUEPRINTS[placement.type], placement.col, placement.row);
    }
  }

  getSmokeSources(): Point[] {
    return [...this.smoke];
  }

  // -------------------------------------------------------------------------------------------
  // Queries used by movement / rendering
  // -------------------------------------------------------------------------------------------

  collides(box: TileBox): boolean {
    for (const p of this.pieces) {
      if (box.minX < p.box.maxX && box.maxX > p.box.minX && box.minY < p.box.maxY && box.maxY > p.box.minY) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns a depth for a character standing on `box` whose natural depth is its feet screen Y.
   * Pieces overlapping the character on screen are classified as behind or in front using a
   * separating-axis test in tile space; the depth is then clamped between them.
   */
  resolveDepth(box: TileBox, naturalDepth: number, screenRect: Phaser.Geom.Rectangle): number {
    let lower = -Infinity;
    let upper = Infinity;
    for (const p of this.pieces) {
      if (!Phaser.Geom.Rectangle.Overlaps(p.bounds, screenRect)) continue;
      const relation = classify(p.box, box);
      if (relation === 'behind') lower = Math.max(lower, p.depth);
      else if (relation === 'front') upper = Math.min(upper, p.depth);
    }
    if (lower >= upper) return naturalDepth; // contradictory (should not happen with sane layouts)
    if (naturalDepth <= lower) return lower + 0.5;
    if (naturalDepth >= upper) return upper - 0.5;
    return naturalDepth;
  }

  /** Fades tall pieces that stand in front of the character and cover it on screen. */
  updateOcclusion(box: TileBox, screenRect: Phaser.Geom.Rectangle, deltaMs: number): void {
    const k = Math.min(1, (deltaMs / 1000) * FADE_SPEED);
    for (const p of this.pieces) {
      const hides = p.canFade && Phaser.Geom.Rectangle.Overlaps(p.bounds, screenRect) && classify(p.box, box) === 'front';
      const target = hides ? FADED_ALPHA : 1;
      if (p.image.alpha !== target) {
        const next = p.image.alpha + (target - p.image.alpha) * k;
        p.image.setAlpha(Math.abs(next - target) < 0.01 ? target : next);
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------------------------

  private buildOne(scene: Phaser.Scene, groundLayer: Phaser.GameObjects.Layer, bp: StructureBlueprint, col: number, row: number): void {
    const t = bp.wallThickness;

    for (const w of bp.walls) {
      let box: TileBox;
      let anchor: Point;
      if (w.orientation === 'x') {
        const back = w.y === 0;
        const y0 = row + w.y;
        box = back
          ? { minX: col + w.x, maxX: col + w.x + 1, minY: y0, maxY: y0 + t }
          : { minX: col + w.x, maxX: col + w.x + 1, minY: y0 - t, maxY: y0 };
        // The visible face is the one facing +y (interior for back walls, exterior for front walls).
        anchor = { x: col + w.x, y: box.maxY };
      } else {
        const back = w.x === 0;
        const x0 = col + w.x;
        box = back
          ? { minX: x0, maxX: x0 + t, minY: row + w.y, maxY: row + w.y + 1 }
          : { minX: x0 - t, maxX: x0, minY: row + w.y, maxY: row + w.y + 1 };
        anchor = { x: box.maxX, y: row + w.y };
      }
      const art = getWallTexture(scene.textures, w.variant, w.orientation);
      this.addPiece(scene, art.key, art.originX, art.originY, anchor, box);
    }

    for (const post of bp.posts) {
      const minX = post.x === 0 ? col : col + post.x - t;
      const minY = post.y === 0 ? row : row + post.y - t;
      const box: TileBox = { minX, minY, maxX: minX + t, maxY: minY + t };
      const art = getPostTexture(scene.textures, post.variant);
      const anchor = { x: box.maxX, y: box.maxY };
      this.addPiece(scene, art.key, art.originX, art.originY, anchor, box);
      if (post.variant === 'chimney') {
        const top = this.projection.tileToWorld(anchor.x, anchor.y);
        this.smoke.push({ x: top.x, y: top.y + art.topOffsetY });
      }
    }

    for (const d of bp.decals) {
      const art = getDecalTexture(scene.textures, d.variant);
      const pos = this.projection.tileToWorld(col + d.x, row + d.y);
      const image = scene.make.image({ x: pos.x, y: pos.y, key: art.key }, false);
      image.setOrigin(art.originX, art.originY);
      groundLayer.add(image); // drawn on top of all floor tiles, below everything else
    }
  }

  private addPiece(scene: Phaser.Scene, key: string, originX: number, originY: number, anchor: Point, box: TileBox): void {
    const pos = this.projection.tileToWorld(anchor.x, anchor.y);
    const centre = this.projection.tileToWorld((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    const image = scene.add.image(Math.round(pos.x), Math.round(pos.y), key).setOrigin(originX, originY);
    image.setDepth(centre.y);
    const bounds = image.getBounds();
    this.pieces.push({ box, image, depth: centre.y, bounds, canFade: bounds.height > 40 });
  }
}

/** Is `piece` behind or in front of `actor` (tile space, viewer looks towards -x/-y)? */
function classify(piece: TileBox, actor: TileBox): 'behind' | 'front' | 'none' {
  const behind = piece.maxX <= actor.minX + EPSILON || piece.maxY <= actor.minY + EPSILON;
  const front = actor.maxX <= piece.minX + EPSILON || actor.maxY <= piece.minY + EPSILON;
  if (behind && !front) return 'behind';
  if (front && !behind) return 'front';
  return 'none';
}
