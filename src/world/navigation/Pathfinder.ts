import type { Point } from '../../core/types';

/** What the pathfinder needs from a map: the same footprint collision movement uses. */
export interface NavigationGrid {
  cols: number;
  rows: number;
  isInside(col: number, row: number): boolean;
  isAreaFree(box: { minX: number; minY: number; maxX: number; maxY: number }): boolean;
}

export interface PathOptions {
  /** Half-size of the walker's square footprint (tiles). */
  radius: number;
  /** Search budget (expanded tiles). */
  maxNodes?: number;
  /** How far (tiles) to look for a standable tile when the goal itself is blocked. */
  goalSearchRadius?: number;
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/**
 * Grid A* in tile space with the walker's real footprint collision (blocked tiles, thin walls, posts),
 * then string-pulled into straight segments. Pure: no Phaser, so it is unit-tested against the real map.
 */
export class Pathfinder {
  private readonly standCache = new Map<number, boolean>();

  constructor(
    private readonly grid: NavigationGrid,
    private readonly options: PathOptions,
  ) {}

  /** Can the walker stand on this tile's centre? */
  standable(col: number, row: number): boolean {
    if (!this.grid.isInside(col, row)) return false;
    const key = row * this.grid.cols + col;
    let v = this.standCache.get(key);
    if (v === undefined) {
      v = this.free(col + 0.5, row + 0.5);
      this.standCache.set(key, v);
    }
    return v;
  }

  /** Straight walk between two points without touching anything (sampled every 0.1 tile). */
  clearLine(a: Point, b: Point): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(d / 0.1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.free(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /** Nearest standable tile to a point (spiral search), or null. */
  nearestStandable(p: Point, maxRadius = this.options.goalSearchRadius ?? 3): { col: number; row: number } | null {
    const c0 = Math.floor(p.x);
    const r0 = Math.floor(p.y);
    let best: { col: number; row: number } | null = null;
    let bestD = Infinity;
    for (let r = 0; r <= maxRadius; r++) {
      for (let dr = -r; dr <= r; dr++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
          const c = c0 + dc;
          const w = r0 + dr;
          if (!this.standable(c, w)) continue;
          const d = Math.hypot(c + 0.5 - p.x, w + 0.5 - p.y);
          if (d < bestD) {
            bestD = d;
            best = { col: c, row: w };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Waypoints (continuous tile space, excluding the start) from `start` to `goal`, or null when there is
   * no way there. When the goal is blocked the path ends at the nearest reachable standable tile.
   */
  findPath(start: Point, goal: Point): Point[] | null {
    const target = this.free(goal.x, goal.y) ? { col: Math.floor(goal.x), row: Math.floor(goal.y) } : this.nearestStandable(goal);
    if (!target) return null;
    const exactGoal = this.free(goal.x, goal.y) ? goal : { x: target.col + 0.5, y: target.row + 0.5 };
    if (this.clearLine(start, exactGoal)) return [exactGoal];

    const cols = this.grid.cols;
    const sc = Math.floor(start.x);
    const sr = Math.floor(start.y);
    const startKey = sr * cols + sc;
    const goalKey = target.row * cols + target.col;
    const g = new Map<number, number>([[startKey, 0]]);
    const parent = new Map<number, number>();
    const open = new MinHeap();
    const h = (c: number, r: number): number => {
      const dx = Math.abs(c - target.col);
      const dy = Math.abs(r - target.row);
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };
    open.push(startKey, h(sc, sr));
    const closed = new Set<number>();
    const budget = this.options.maxNodes ?? 6000;
    let found = false;
    while (open.size && closed.size < budget) {
      const key = open.pop();
      if (closed.has(key)) continue;
      if (key === goalKey) {
        found = true;
        break;
      }
      closed.add(key);
      const c = key % cols;
      const r = Math.floor(key / cols);
      for (const [dc, dr, cost] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        const nk = nr * cols + nc;
        if (closed.has(nk) || !this.standable(nc, nr)) continue;
        // no corner cutting, and nothing thin (walls on tile edges) between the two centres
        if (dc && dr && (!this.standable(c + dc, r) || !this.standable(c, r + dr))) continue;
        if (!this.clearLine({ x: c + 0.5, y: r + 0.5 }, { x: nc + 0.5, y: nr + 0.5 })) continue;
        const ng = (g.get(key) ?? 0) + cost;
        if (ng >= (g.get(nk) ?? Infinity)) continue;
        g.set(nk, ng);
        parent.set(nk, key);
        open.push(nk, ng + h(nc, nr));
      }
    }
    if (!found) return null;

    const cells: Point[] = [];
    for (let k = goalKey; k !== startKey; k = parent.get(k)!) cells.push({ x: (k % cols) + 0.5, y: Math.floor(k / cols) + 0.5 });
    cells.reverse();
    if (cells.length) cells[cells.length - 1] = exactGoal;
    return this.smooth(start, cells);
  }

  /** String pulling: keep only the waypoints needed to walk straight lines without touching anything. */
  private smooth(start: Point, cells: Point[]): Point[] {
    const out: Point[] = [];
    let from = start;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clearLine(from, cells[j])) j--;
      out.push(cells[j]);
      from = cells[j];
      i = j + 1;
    }
    return out;
  }

  private free(x: number, y: number): boolean {
    const r = this.options.radius;
    return this.grid.isAreaFree({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r });
  }
}

/** Binary min-heap of keys by priority. */
class MinHeap {
  private readonly keys: number[] = [];
  private readonly prio: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, priority: number): void {
    this.keys.push(key);
    this.prio.push(priority);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prio[p] <= this.prio[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.keys[0];
    const lastK = this.keys.pop()!;
    const lastP = this.prio.pop()!;
    if (this.keys.length) {
      this.keys[0] = lastK;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.keys.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
