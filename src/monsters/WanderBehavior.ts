import { createRng } from '../assets/mockup/PixelCanvas';
import type { Point } from '../core/types';
import type { MonsterWanderBehavior } from './MonsterDefinition';

/** Distance (tiles) at which a destination counts as reached. */
const ARRIVE_DISTANCE = 0.08;
/** Wait after being blocked before trying another destination (ms). */
const BLOCKED_PAUSE_MS = 400;
/** Random destinations tried before giving up until the next pause. */
const PICK_ATTEMPTS = 10;
/** A walk that stops getting closer to its destination for this long is abandoned (ms). */
const STALL_TIMEOUT_MS = 600;
/** Minimum improvement (tiles) that counts as progress. */
const PROGRESS_EPSILON = 0.01;

/**
 * Decides where a monster walks while idle: pause -> pick a random reachable point inside the circle
 * around its home -> walk there -> pause ... It only returns a direction each frame; the actual
 * movement and collision happen in the entity (same tile-space movement as the player).
 *
 * Uses a seeded RNG so a given monster behaves the same way every run (handy for testing and for
 * future server-driven movement).
 */
export class WanderBehavior {
  private readonly rng: () => number;
  private waitMs: number;
  private target: Point | null = null;
  /** Closest the monster has come to the current destination, and how long since it improved. */
  private bestDistance = Infinity;
  private stallMs = 0;

  constructor(
    private readonly home: Point,
    private readonly config: MonsterWanderBehavior,
    seed: number,
  ) {
    this.rng = createRng(seed);
    // Stagger the first walk so monsters do not all start moving on the same frame.
    this.waitMs = this.randomPause();
  }

  /**
   * @param canStand whether the monster's footprint may stand at a tile-space point
   * @returns unit direction to walk this frame, or null to stand still
   */
  update(position: Point, deltaMs: number, canStand: (p: Point) => boolean): Point | null {
    if (!this.target) {
      this.waitMs -= deltaMs;
      if (this.waitMs > 0) return null;
      this.target = this.pickDestination(position, canStand);
      if (!this.target) {
        this.waitMs = this.randomPause();
        return null;
      }
      this.bestDistance = Infinity;
      this.stallMs = 0;
    }
    const dx = this.target.x - position.x;
    const dy = this.target.y - position.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= ARRIVE_DISTANCE) {
      this.target = null;
      this.waitMs = this.randomPause();
      return null;
    }
    // Sliding along an obstacle can keep the monster moving without ever getting closer
    // (e.g. jittering beside a tree). Give up on a destination that stops getting nearer.
    if (distance < this.bestDistance - PROGRESS_EPSILON) {
      this.bestDistance = distance;
      this.stallMs = 0;
    } else {
      this.stallMs += deltaMs;
      if (this.stallMs >= STALL_TIMEOUT_MS) {
        this.blocked();
        return null;
      }
    }
    return { x: dx / distance, y: dy / distance };
  }

  /** Called when movement made no progress or would leave the circle: rest briefly, then re-pick. */
  blocked(): void {
    this.target = null;
    this.waitMs = BLOCKED_PAUSE_MS;
  }

  isWalking(): boolean {
    return this.target !== null;
  }

  getHome(): Point {
    return this.home;
  }

  private pickDestination(position: Point, canStand: (p: Point) => boolean): Point | null {
    const r = this.config.radiusTiles;
    for (let i = 0; i < PICK_ATTEMPTS; i++) {
      const angle = this.rng() * Math.PI * 2;
      const dist = Math.sqrt(this.rng()) * r; // uniform over the disc
      const candidate = { x: this.home.x + Math.cos(angle) * dist, y: this.home.y + Math.sin(angle) * dist };
      if (Math.hypot(candidate.x - position.x, candidate.y - position.y) < 0.5) continue;
      if (canStand(candidate)) return candidate;
    }
    return null;
  }

  private randomPause(): number {
    const [min, max] = this.config.pauseMs;
    return min + this.rng() * (max - min);
  }
}
