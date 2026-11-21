import type { Point } from '../core/types';

export interface CollisionQuery {
  /** True when a footprint box (continuous tile space) may be occupied. */
  isAreaFree(box: { minX: number; minY: number; maxX: number; maxY: number }): boolean;
}

export interface MovementConfig {
  /** Ground speed in tiles per second. */
  speed: number;
  /** Half-size of the square collision footprint, in tiles. */
  radius: number;
}

/** Longest step simulated in one go, to avoid tunnelling through a tile on a frame hitch. */
const MAX_STEP_SECONDS = 1 / 30;

/**
 * Pure movement + collision in tile (ground) space. No rendering, no input, no Phaser.
 * Axis-separated resolution lets the player slide along walls and obstacles.
 */
export class PlayerMovement {
  readonly position: Point;

  constructor(
    start: Point,
    private readonly collision: CollisionQuery,
    private readonly config: MovementConfig,
  ) {
    this.position = { ...start };
  }

  /**
   * @param direction unit vector in tile space (or zero)
   * @param speedScale multiplies the configured speed (chasing, or a shorter final step onto a waypoint)
   * @returns true if the position changed
   */
  step(direction: Point, deltaSeconds: number, speedScale = 1): boolean {
    if (direction.x === 0 && direction.y === 0) return false;
    let remaining = deltaSeconds;
    let moved = false;
    while (remaining > 0) {
      const dt = Math.min(remaining, MAX_STEP_SECONDS);
      remaining -= dt;
      const dx = direction.x * this.config.speed * speedScale * dt;
      const dy = direction.y * this.config.speed * speedScale * dt;
      if (dx !== 0) moved = this.advance('x', dx) || moved;
      if (dy !== 0) moved = this.advance('y', dy) || moved;
    }
    return moved;
  }

  /** Moves along one axis; when blocked, halves the step a few times to end up flush with the obstacle. */
  private advance(axis: 'x' | 'y', delta: number): boolean {
    let step = delta;
    for (let i = 0; i < 5; i++) {
      const nx = axis === 'x' ? this.position.x + step : this.position.x;
      const ny = axis === 'y' ? this.position.y + step : this.position.y;
      if (this.canOccupy(nx, ny)) {
        this.position.x = nx;
        this.position.y = ny;
        return true;
      }
      step /= 2;
    }
    return false;
  }

  private canOccupy(x: number, y: number): boolean {
    const r = this.config.radius;
    return this.collision.isAreaFree({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r });
  }
}
