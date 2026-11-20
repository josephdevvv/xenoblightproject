import Phaser from 'phaser';
import type { Point } from '../../core/types';
import { getDecalTexture, getPostTexture, getWallTexture } from '../../assets/mockup/MockupStructureFactory';
import type { IsoProjection } from '../IsoProjection';
import type { StructurePlacement } from '../MapData';
import { STRUCTURE_BLUEPRINTS } from './StructureBlueprints';
import type { PieceSpec, TileBox } from './StructureGeometry';

export type { TileBox } from './StructureGeometry';

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
/** Screen-space bucket size for the depth / occlusion queries. */
const BUCKET = 256;

/**
 * Renders every wall piece on a map (building walls, free-standing wall runs) and resolves character
 * depth against them. Large multi-tile props (monument, bell tower, carts) are registered here too so
 * they sort and fade like walls.
 *
 * Why not one big sprite per building? A single image has a single depth, so a character could never be
 * inside it and in front of the back wall but behind the front wall at the same time. Instead each wall
 * piece is a separate sprite with a thin box, and characters get their depth corrected against
 * nearby pieces with a separating-axis test in tile space (see `resolveDepth`).
 *
 * Collision is NOT handled here: MapLayout owns it (same piece boxes).
 */
export class StructureLayer {
  private readonly pieces: Piece[] = [];
  private readonly buckets = new Map<number, Piece[]>();
  private readonly smoke: Point[] = [];
  /** Pieces whose alpha is not at rest (faded or fading), so idle frames do no work. */
  private readonly fading = new Set<Piece>();

  constructor(
    private readonly projection: IsoProjection,
    private readonly placements: StructurePlacement[],
    private readonly specs: readonly PieceSpec[],
  ) {}

  /** Footprint tiles of all structures (for validation, spawning, the minimap). */
  footprints(): TileBox[] {
    return this.placements.map((p) => {
      const bp = STRUCTURE_BLUEPRINTS[p.type];
      return { minX: p.col, minY: p.row, maxX: p.col + bp.width, maxY: p.row + bp.height };
    });
  }

  /** Creates wall / post sprites and building floor decals. */
  build(scene: Phaser.Scene, groundLayer: Phaser.GameObjects.Layer): void {
    for (const spec of this.specs) {
      if (spec.kind === 'wall') {
        const art = getWallTexture(scene.textures, spec.variant, spec.orientation);
        this.register(this.addImage(scene, art.key, art.originX, art.originY, spec.anchor), spec.box);
        continue;
      }
      const art = getPostTexture(scene.textures, spec.variant);
      this.register(this.addImage(scene, art.key, art.originX, art.originY, spec.anchor), spec.box);
      if (spec.variant === 'chimney') {
        const top = this.projection.tileToWorld(spec.anchor.x, spec.anchor.y);
        this.smoke.push({ x: top.x, y: top.y + art.topOffsetY });
      }
    }

    for (const placement of this.placements) {
      for (const d of STRUCTURE_BLUEPRINTS[placement.type].decals) {
        const art = getDecalTexture(scene.textures, d.variant);
        const pos = this.projection.tileToWorld(placement.col + d.x, placement.row + d.y);
        const image = scene.make.image({ x: pos.x, y: pos.y, key: art.key }, false);
        image.setOrigin(art.originX, art.originY);
        groundLayer.add(image); // drawn on top of all floor tiles, below everything else
      }
    }
  }

  /** Adds an existing image (e.g. a multi-tile prop) to depth sorting / occlusion with footprint `box`. */
  register(image: Phaser.GameObjects.Image, box: TileBox, canFade?: boolean): void {
    const centre = this.projection.tileToWorld((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2);
    image.setDepth(centre.y);
    const bounds = image.getBounds();
    const piece: Piece = { box, image, depth: centre.y, bounds, canFade: canFade ?? bounds.height > 40 };
    this.pieces.push(piece);
    for (const key of this.bucketsOf(bounds)) {
      const list = this.buckets.get(key);
      if (list) list.push(piece);
      else this.buckets.set(key, [piece]);
    }
  }

  getSmokeSources(): Point[] {
    return [...this.smoke];
  }

  // -------------------------------------------------------------------------------------------
  // Queries used by rendering
  // -------------------------------------------------------------------------------------------

  /**
   * Returns a depth for a character standing on `box` whose natural depth is its feet screen Y.
   * Pieces overlapping the character on screen are classified as behind or in front using a
   * separating-axis test in tile space; the depth is then clamped between them.
   */
  resolveDepth(box: TileBox, naturalDepth: number, screenRect: Phaser.Geom.Rectangle): number {
    let lower = -Infinity;
    let upper = Infinity;
    for (const p of this.near(screenRect)) {
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
    const hiding = new Set<Piece>();
    for (const p of this.near(screenRect)) {
      if (p.canFade && Phaser.Geom.Rectangle.Overlaps(p.bounds, screenRect) && classify(p.box, box) === 'front') hiding.add(p);
    }
    for (const p of hiding) this.fading.add(p);
    for (const p of this.fading) {
      const target = hiding.has(p) ? FADED_ALPHA : 1;
      const next = p.image.alpha + (target - p.image.alpha) * k;
      p.image.setAlpha(Math.abs(next - target) < 0.01 ? target : next);
      if (p.image.alpha === 1 && target === 1) this.fading.delete(p);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private addImage(scene: Phaser.Scene, key: string, originX: number, originY: number, anchor: Point): Phaser.GameObjects.Image {
    const pos = this.projection.tileToWorld(anchor.x, anchor.y);
    return scene.add.image(Math.round(pos.x), Math.round(pos.y), key).setOrigin(originX, originY);
  }

  private near(rect: Phaser.Geom.Rectangle): Set<Piece> {
    const out = new Set<Piece>();
    for (const key of this.bucketsOf(rect)) for (const p of this.buckets.get(key) ?? []) out.add(p);
    return out;
  }

  private *bucketsOf(r: Phaser.Geom.Rectangle): Generator<number> {
    const c0 = Math.floor(r.x / BUCKET);
    const c1 = Math.floor((r.x + r.width) / BUCKET);
    const r0 = Math.floor(r.y / BUCKET);
    const r1 = Math.floor((r.y + r.height) / BUCKET);
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) yield (y + 4) * 4096 + (x + 4);
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
