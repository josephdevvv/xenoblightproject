import type { Point } from '../../core/types';
import {
  OPEN_WALL_VARIANTS,
  STRUCTURE_BLUEPRINTS,
  type PostVariant,
  type StructureType,
  type WallOrientation,
  type WallVariant,
} from './StructureBlueprints';

/** Axis-aligned box in continuous tile space. */
export interface TileBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * One wall or post piece: where it stands (tile space) and what it looks like. Pure data, shared by
 * rendering (StructureLayer) and collision (MapLayout) so both always agree.
 */
export type PieceSpec =
  | { kind: 'wall'; variant: WallVariant; orientation: WallOrientation; box: TileBox; anchor: Point; solid: boolean }
  | { kind: 'post'; variant: PostVariant; box: TileBox; anchor: Point; solid: true };

/** A free-standing wall line on the map (city wall, plaza wall). `null` entries are gaps. */
export interface WallRun {
  orientation: WallOrientation;
  /** Start corner (tile coords). 'x' runs along +x on the line y = row; 'y' along +y on x = col. */
  col: number;
  row: number;
  variants: (WallVariant | null)[];
  /** Posts at both ends of every wall segment (default true). */
  posts?: boolean;
  thickness?: number;
}

const RUN_THICKNESS = 0.24;

/** Every piece of one placed structure (footprint min corner at col, row). */
export function structurePieces(type: StructureType, col: number, row: number): PieceSpec[] {
  const bp = STRUCTURE_BLUEPRINTS[type];
  const t = bp.wallThickness;
  const pieces: PieceSpec[] = [];

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
    pieces.push({ kind: 'wall', variant: w.variant, orientation: w.orientation, box, anchor, solid: !OPEN_WALL_VARIANTS.has(w.variant) });
  }

  for (const post of bp.posts) {
    const minX = post.x === 0 ? col : col + post.x - t;
    const minY = post.y === 0 ? row : row + post.y - t;
    const box: TileBox = { minX, minY, maxX: minX + t, maxY: minY + t };
    pieces.push({ kind: 'post', variant: post.variant, box, anchor: { x: box.maxX, y: box.maxY }, solid: true });
  }
  return pieces;
}

/** Pieces of a free-standing wall run: thin walls centred on the line, posts at segment ends. */
export function wallRunPieces(run: WallRun): PieceSpec[] {
  const t = run.thickness ?? RUN_THICKNESS;
  const h = t / 2;
  const pieces: PieceSpec[] = [];
  const along = (i: number): Point => (run.orientation === 'x' ? { x: run.col + i, y: run.row } : { x: run.col, y: run.row + i });

  run.variants.forEach((variant, i) => {
    if (!variant) return;
    const a = along(i);
    const box: TileBox =
      run.orientation === 'x'
        ? { minX: a.x, maxX: a.x + 1, minY: a.y - h, maxY: a.y + h }
        : { minX: a.x - h, maxX: a.x + h, minY: a.y, maxY: a.y + 1 };
    const anchor = run.orientation === 'x' ? { x: a.x, y: box.maxY } : { x: box.maxX, y: a.y };
    pieces.push({ kind: 'wall', variant, orientation: run.orientation, box, anchor, solid: !OPEN_WALL_VARIANTS.has(variant) });
  });

  if (run.posts !== false) {
    const corners = new Map<number, WallVariant>();
    run.variants.forEach((variant, i) => {
      if (!variant) return;
      if (!corners.has(i) || isTaller(variant, corners.get(i)!)) corners.set(i, variant);
      if (!corners.has(i + 1) || isTaller(variant, corners.get(i + 1)!)) corners.set(i + 1, variant);
    });
    for (const [i, variant] of corners) {
      // only at segment ends (next to a gap or the run's end)
      const before = i > 0 ? run.variants[i - 1] : null;
      const after = i < run.variants.length ? run.variants[i] : null;
      if (before && after) continue;
      const c = along(i);
      const box: TileBox = { minX: c.x - h, maxX: c.x + h, minY: c.y - h, maxY: c.y + h };
      pieces.push({ kind: 'post', variant: postFor(variant), box, anchor: { x: box.maxX, y: box.maxY }, solid: true });
    }
  }
  return pieces;
}

const HEIGHT_RANK: Partial<Record<WallVariant, number>> = {
  gothic_tall: 6,
  gothic_lancet: 6,
  gothic_broken: 5,
  arch_open: 6,
  arch_broken: 5,
  stone_tall: 4,
  stone_window: 4,
  tall_plain: 4,
  tall_window: 4,
  tall_gable: 4,
  tall_broken: 3,
  stone_ruin: 3,
  stone_mid: 2,
  mid_broken: 2,
};

function isTaller(a: WallVariant, b: WallVariant): boolean {
  return (HEIGHT_RANK[a] ?? 1) > (HEIGHT_RANK[b] ?? 1);
}

function postFor(variant: WallVariant): PostVariant {
  const rank = HEIGHT_RANK[variant] ?? 1;
  if (rank >= 5) return 'buttress';
  if (rank >= 3) return 'stone_post_tall';
  if (rank >= 2) return 'stone_post_mid';
  return 'stone_post_low';
}

export function boxesOverlap(a: TileBox, b: TileBox): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}
