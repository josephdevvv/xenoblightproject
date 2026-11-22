import type { Point } from '../../core/types';

/** The parts of Pathfinder the trail uses. */
export interface TrailNavigation {
  findPath(start: Point, goal: Point): Point[] | null;
  clearLine(a: Point, b: Point): boolean;
}

export interface TrailDot {
  /** Tile space (world anchored). */
  x: number;
  y: number;
  alpha: number;
}

export const TRAIL = {
  /** Distance between dots along the ground (tiles). */
  spacing: 0.5,
  /** The first dot is this far ahead of the player. */
  startGap: 0.55,
  /** The trail ends this far from the target: a free spot beside it, well inside talking range. */
  endDistance: 0.7,
  /** The last dots always stay, also when the player already stands next to the target. */
  keepEnd: 2,
  /** Dots further ahead than this are off screen anyway. */
  maxAhead: 18,
  /** Straying this far from the route plans a new one. */
  deviation: 0.6,
  /** Never plan more often than this. */
  minReplanMs: 200,
  /** Wait after no way was found. */
  retryMs: 1000,
  /** While walking: look for a better way now and then (every few tiles). */
  refreshMs: 1500,
  refreshTiles: 2,
  /** How often the way from the player to the route is checked for obstacles. */
  checkMs: 150,
  fadeMs: 140,
  /** A dot that moved less than this slides there (if the ground between is free), else it cross-fades. */
  slideTiles: 0.9,
  slideMs: 60,
} as const;

interface LiveDot extends TrailDot {
  goalX: number;
  goalY: number;
}

/**
 * The dotted path to a target - pure (no Phaser), unit-tested. Feed it the player's and the target's tile
 * positions every frame; `dots` is what to draw.
 *
 * A route comes from the game's pathfinder (the player's own footprint collision), so it only crosses ground
 * the player can walk. Dots sit at fixed distances from the END of the route: while the player follows it
 * nothing moves, dots behind disappear and dots further on appear. The route is planned again only when the
 * player strays from it, something comes between the player and the route, the target moves, or (while
 * walking) now and then for a better way.
 */
export class PathTrail {
  private route: Point[] = [];
  private lengths: number[] = [];
  private total = 0;
  private progress = 0;
  private plannedFrom: Point | null = null;
  private plannedTarget: Point | null = null;
  private sincePlan = Infinity;
  private sinceCheck = 0;
  private failed = false;
  private readonly live = new Map<number, LiveDot>();
  private fading: TrailDot[] = [];
  private planCount = 0;

  constructor(private readonly nav: TrailNavigation) {}

  /** Dots to draw, including the ones fading in / out. */
  get dots(): TrailDot[] {
    return [...this.live.values(), ...this.fading];
  }

  /** The dots of the current route in order from the target, without the ones fading out (for checks). */
  get current(): TrailDot[] {
    return [...this.live.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  /** The trail is drawn all the way to the target (a long route is only drawn `maxAhead` tiles ahead). */
  get showsEnd(): boolean {
    return this.live.has(0);
  }

  /** How many times a route was planned (for checks). */
  get plans(): number {
    return this.planCount;
  }

  /** `target` null = no trail (what is left fades out). */
  update(deltaMs: number, player: Point, target: Point | null): void {
    this.sincePlan += deltaMs;
    this.sinceCheck += deltaMs;
    if (!target) {
      this.forget();
      this.animate(deltaMs, new Map());
      return;
    }
    if (this.needsPlan(player, target)) this.plan(player, target);
    this.animate(deltaMs, this.wantedDots());
  }

  // ---------------------------------------------------------------------------------------------

  private needsPlan(player: Point, target: Point): boolean {
    if (this.failed) return this.sincePlan >= TRAIL.retryMs;
    if (this.route.length === 0) return true;
    const moved = this.plannedTarget!.x !== target.x || this.plannedTarget!.y !== target.y;
    if (moved) return this.sincePlan >= TRAIL.minReplanMs;

    const strayed = this.follow(player);
    // Beside the target there is nothing better to find: the end of the trail stays where it is.
    if (distance(player, target) <= TRAIL.endDistance + TRAIL.deviation && distance(player, this.route[this.route.length - 1]) <= TRAIL.deviation * 2) return false;
    if (this.sincePlan < TRAIL.minReplanMs) return false;
    if (strayed > TRAIL.deviation) return true;
    if (this.sinceCheck >= TRAIL.checkMs) {
      this.sinceCheck = 0;
      if (!this.nav.clearLine(player, this.pointAt(this.progress + TRAIL.startGap))) return true;
    }
    return this.sincePlan >= TRAIL.refreshMs && distance(player, this.plannedFrom!) >= TRAIL.refreshTiles;
  }

  private plan(player: Point, target: Point): void {
    this.sincePlan = 0;
    this.sinceCheck = 0;
    this.planCount++;
    const path = this.findRoute(player, target);
    this.failed = path === null;
    if (!path) {
      this.route = [];
      return;
    }
    this.route = path;
    this.lengths = [0];
    for (let i = 1; i < path.length; i++) this.lengths.push(this.lengths[i - 1] + distance(path[i - 1], path[i]));
    this.total = this.lengths[this.lengths.length - 1];
    this.progress = 0;
    this.plannedFrom = { ...player };
    this.plannedTarget = { ...target };
    // Keep every dot that can slide to its new place over free ground; the others fade out where they were.
    for (const [k, dot] of this.live) {
      const p = this.dotAt(k);
      if (p && distance(dot, p) <= TRAIL.slideTiles && this.nav.clearLine(dot, p)) {
        dot.goalX = p.x;
        dot.goalY = p.y;
      } else {
        this.fading.push({ x: dot.x, y: dot.y, alpha: dot.alpha });
        this.live.delete(k);
      }
    }
  }

  /** Polyline from the player to the spot beside the target, or null when there is no way. */
  private findRoute(player: Point, target: Point): Point[] | null {
    const path = this.nav.findPath(player, target);
    if (!path || path.length === 0) return null;
    const points = [{ ...player }, ...path];
    const end = points[points.length - 1];
    if (distance(player, target) <= TRAIL.endDistance) return [{ ...player }, this.spotBeside(player, target)];
    if (distance(end, target) > TRAIL.endDistance) return points; // the target's own spot is blocked: end where the path ends
    const out: Point[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (distance(points[i], target) > TRAIL.endDistance) {
        out.push(points[i]);
        continue;
      }
      out.push(enterCircle(points[i - 1], points[i], target, TRAIL.endDistance));
      break;
    }
    return out;
  }

  /** A free spot next to the target when the player is already closer than that: the nearest reachable one. */
  private spotBeside(player: Point, target: Point): Point {
    let best: Point = { ...player };
    let bestD = Infinity;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const p = { x: target.x + Math.cos(a) * TRAIL.endDistance, y: target.y + Math.sin(a) * TRAIL.endDistance };
      const d = distance(player, p);
      if (d < bestD && this.nav.clearLine(player, p)) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  /** Moves `progress` to the player's nearest point on the route nearby; returns the distance to it. */
  private follow(player: Point): number {
    let bestD = Infinity;
    let bestS = this.progress;
    for (let i = 1; i < this.route.length; i++) {
      const s0 = this.lengths[i - 1];
      const len = this.lengths[i] - s0;
      if (s0 + len < this.progress - 1.5 || s0 > this.progress + 1.5) continue;
      const a = this.route[i - 1];
      const b = this.route[i];
      const t = len === 0 ? 0 : clamp(((player.x - a.x) * (b.x - a.x) + (player.y - a.y) * (b.y - a.y)) / (len * len), 0, 1);
      const d = Math.hypot(a.x + (b.x - a.x) * t - player.x, a.y + (b.y - a.y) * t - player.y);
      if (d < bestD) {
        bestD = d;
        bestS = s0 + len * t;
      }
    }
    this.progress = bestS;
    return bestD;
  }

  private pointAt(s: number): Point {
    const at = clamp(s, 0, this.total);
    let i = 1;
    while (i < this.route.length - 1 && this.lengths[i] < at) i++;
    const a = this.route[i - 1];
    const b = this.route[i];
    const len = this.lengths[i] - this.lengths[i - 1];
    const t = len === 0 ? 0 : (at - this.lengths[i - 1]) / len;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Dot k = k spacings before the end of the route; null when the route is shorter or the spot is not free. */
  private dotAt(k: number): Point | null {
    const s = this.total - k * TRAIL.spacing;
    if (s < 0) return null;
    const p = this.pointAt(s);
    return this.nav.clearLine(p, p) ? p : null;
  }

  private wantedDots(): Map<number, Point> {
    const out = new Map<number, Point>();
    if (this.route.length === 0) return out;
    for (let k = 0; k * TRAIL.spacing <= this.total; k++) {
      const s = this.total - k * TRAIL.spacing;
      if (k >= TRAIL.keepEnd && s < this.progress + TRAIL.startGap) break; // behind (or under) the player
      if (s > this.progress + TRAIL.maxAhead) continue;
      const known = this.live.get(k);
      const p = known ? { x: known.goalX, y: known.goalY } : this.dotAt(k);
      if (p) out.set(k, p);
    }
    return out;
  }

  private animate(deltaMs: number, wanted: ReadonlyMap<number, Point>): void {
    const fade = deltaMs / TRAIL.fadeMs;
    const slide = 1 - Math.exp(-deltaMs / TRAIL.slideMs);
    for (const [k, dot] of this.live) {
      if (wanted.has(k)) continue;
      this.fading.push({ x: dot.x, y: dot.y, alpha: dot.alpha });
      this.live.delete(k);
    }
    for (const [k, p] of wanted) if (!this.live.has(k)) this.live.set(k, { x: p.x, y: p.y, goalX: p.x, goalY: p.y, alpha: 0 });
    for (const dot of this.live.values()) {
      dot.alpha = Math.min(1, dot.alpha + fade);
      if (dot.x === dot.goalX && dot.y === dot.goalY) continue;
      const near = Math.hypot(dot.goalX - dot.x, dot.goalY - dot.y) < 0.01;
      const to = near ? { x: dot.goalX, y: dot.goalY } : { x: dot.x + (dot.goalX - dot.x) * slide, y: dot.y + (dot.goalY - dot.y) * slide };
      if (this.nav.clearLine(to, to)) {
        dot.x = to.x;
        dot.y = to.y;
      } else {
        // clearLine samples a line: a corner between two samples - cross-fade instead of sliding over it
        this.fading.push({ x: dot.x, y: dot.y, alpha: dot.alpha });
        dot.x = dot.goalX;
        dot.y = dot.goalY;
        dot.alpha = 0;
      }
    }
    for (const dot of this.fading) dot.alpha -= fade;
    this.fading = this.fading.filter((d) => d.alpha > 0);
  }

  private forget(): void {
    this.route = [];
    this.failed = false;
    this.sincePlan = Infinity;
  }
}

/** First point of segment a -> b (a outside, b inside) on the circle around c. */
function enterCircle(a: Point, b: Point, c: Point, r: number): Point {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const p = { x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid };
    if (distance(p, c) > r) lo = mid;
    else hi = mid;
  }
  return { x: a.x + (b.x - a.x) * hi, y: a.y + (b.y - a.y) * hi };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
