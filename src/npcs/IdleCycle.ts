/**
 * Idle routine of a stationary NPC: show the standing frame for `stillMs`, play the action frames once
 * (`frameMs` each), return to the standing frame and start counting again - forever.
 *
 *   still (stillMs, stand frame) -> play frames once -> still (stillMs, stand frame) -> play ...
 *
 * The countdown starts when the animation has finished, a new play can only start from `still` (never two
 * at once) and it is driven by update(delta) - no timers to clean up. Pure (unit-tested).
 */
export type IdleCyclePhase = 'still' | 'playing';

export class IdleCycle {
  private phase: IdleCyclePhase = 'still';
  private elapsed = 0;
  private plays = 0;

  constructor(
    readonly stillMs: number,
    readonly frameMs: number,
    /** Sheet frame shown while standing. */
    readonly standFrame: number,
    /** Sheet frames of the animation, played once in this order. */
    readonly playFrames: readonly number[],
  ) {}

  /** Advances time; returns the sheet frame to show now. Large deltas are handled step by step. */
  update(deltaMs: number): number {
    let left = Math.max(0, deltaMs);
    while (left > 0) {
      const phaseLength = this.phaseLength();
      const step = Math.min(left, phaseLength - this.elapsed);
      this.elapsed += step;
      left -= step;
      if (this.elapsed >= phaseLength) {
        this.elapsed = 0;
        if (this.phase === 'still') {
          this.phase = 'playing';
          this.plays++;
        } else {
          this.phase = 'still';
        }
      }
    }
    return this.frame();
  }

  /** Sheet frame shown now. */
  frame(): number {
    if (this.phase === 'still') return this.standFrame;
    return this.playFrames[Math.min(this.playFrames.length - 1, Math.floor(this.elapsed / this.frameMs))];
  }

  getPhase(): IdleCyclePhase {
    return this.phase;
  }

  /** How many times the animation has started (for checks). */
  getPlays(): number {
    return this.plays;
  }

  private phaseLength(): number {
    return this.phase === 'still' ? this.stillMs : this.frameMs * this.playFrames.length;
  }
}
