/**
 * Smooth camera follow without pixel jitter.
 *
 * Phaser's own follow floors the lerped scroll, and every sprite floors its own world position:
 * the player's screen position is floor(x) - floor(scroll), two roundings that step on different
 * frames, so a walking player shook back and forth by 1 px (measured: up to 41 reversals in 2 s).
 *
 * Here the camera keeps an exact (float) scroll and is drawn at floor(scroll), so the world still
 * scrolls in whole pixels; the followed character is drawn at an integer position derived from its
 * EXACT distance to the camera (renderX/renderY), so its screen position only ever moves the way it
 * really moves. World / physics positions are never rounded - only the final drawn position.
 */
export interface FollowCamera {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  setScroll(x: number, y: number): unknown;
  clampX(x: number): number;
  clampY(y: number): number;
}

export interface StableFollowOptions {
  /** Fraction of the remaining distance covered per 60 fps frame (Phaser follow lerp). */
  lerp: number;
  offsetX?: number;
  offsetY?: number;
}

export class StableCameraFollow {
  /** Exact scroll; the camera is drawn at its floor. */
  private fx = 0;
  private fy = 0;
  private started = false;

  constructor(
    private readonly camera: FollowCamera,
    private readonly options: StableFollowOptions,
  ) {}

  /** Moves the camera toward the target (world position, e.g. the player's feet). Frame-rate independent. */
  update(targetX: number, targetY: number, deltaMs: number): void {
    const desiredX = targetX + (this.options.offsetX ?? 0) - this.camera.width / 2;
    const desiredY = targetY + (this.options.offsetY ?? 0) - this.camera.height / 2;
    if (!this.started) {
      this.fx = desiredX;
      this.fy = desiredY;
      this.started = true;
    } else {
      const t = 1 - Math.pow(1 - this.options.lerp, Math.max(0, deltaMs) / (1000 / 60));
      this.fx += (desiredX - this.fx) * t;
      this.fy += (desiredY - this.fy) * t;
    }
    this.fx = this.camera.clampX(this.fx);
    this.fy = this.camera.clampY(this.fy);
    this.camera.setScroll(Math.floor(this.fx), Math.floor(this.fy));
  }

  /** The next update jumps straight to the target (no easing) - e.g. after a respawn teleport. */
  snap(): void {
    this.started = false;
  }

  /** Integer draw position for a world x so the followed object's screen motion is exact. */
  renderX(worldX: number): number {
    return Math.floor(this.fx) + Math.round(worldX - this.fx);
  }

  renderY(worldY: number): number {
    return Math.floor(this.fy) + Math.round(worldY - this.fy);
  }

  /** Exact (unrounded) scroll, for tests / debugging. */
  get exactScroll(): { x: number; y: number } {
    return { x: this.fx, y: this.fy };
  }
}
