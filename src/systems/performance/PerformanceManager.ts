import { PERFORMANCE_CONFIG } from './PerformanceConfig';

export type UpdatePriority = 'high' | 'medium' | 'low' | 'dormant';

export interface FrameStats {
  fps: number;
  avgFrameMs: number;
  maxFrameMs: number;
  /** Share of recent frames above the frame-time budget (0..1). */
  overBudget: number;
}

export interface BudgetSnapshot {
  gameObjects: number;
  visibleCharacters: number;
}

const WINDOW = 120;

/**
 * Frame-time monitoring, budgets and distance-based update priorities.
 * Fed once per frame by SystemScene. Purely observational - it never changes gameplay.
 */
export class PerformanceManager {
  private readonly samples = new Float32Array(WINDOW);
  private index = 0;
  private count = 0;
  private lastWarning = -Infinity;

  sample(deltaMs: number): void {
    this.samples[this.index] = deltaMs;
    this.index = (this.index + 1) % WINDOW;
    this.count = Math.min(this.count + 1, WINDOW);
  }

  getFrameStats(): FrameStats {
    if (this.count === 0) return { fps: 0, avgFrameMs: 0, maxFrameMs: 0, overBudget: 0 };
    let sum = 0;
    let max = 0;
    let over = 0;
    for (let i = 0; i < this.count; i++) {
      const v = this.samples[i];
      sum += v;
      if (v > max) max = v;
      if (v > PERFORMANCE_CONFIG.budgets.frameTimeMs) over++;
    }
    const avg = sum / this.count;
    return { fps: avg > 0 ? 1000 / avg : 0, avgFrameMs: avg, maxFrameMs: max, overBudget: over / this.count };
  }

  /** Priority band for something `distancePx` away from the camera centre (for future remote actors / FX). */
  priorityForDistance(distancePx: number): UpdatePriority {
    const p = PERFORMANCE_CONFIG.priority;
    if (distancePx <= p.highRadiusPx) return 'high';
    if (distancePx <= p.mediumRadiusPx) return 'medium';
    if (distancePx <= p.lowRadiusPx) return 'low';
    return 'dormant';
  }

  /** Returns budget violations; also logs them (throttled) in development builds. */
  checkBudgets(snapshot: BudgetSnapshot, nowMs: number): string[] {
    const b = PERFORMANCE_CONFIG.budgets;
    const warnings: string[] = [];
    if (snapshot.gameObjects > b.maxGameObjects) warnings.push(`game objects ${snapshot.gameObjects} > ${b.maxGameObjects}`);
    if (snapshot.visibleCharacters > b.maxVisibleCharacters) {
      warnings.push(`visible characters ${snapshot.visibleCharacters} > ${b.maxVisibleCharacters}`);
    }
    if (warnings.length > 0 && import.meta.env.DEV && nowMs - this.lastWarning > PERFORMANCE_CONFIG.warningIntervalMs) {
      this.lastWarning = nowMs;
      console.warn(`[performance] budget exceeded: ${warnings.join(', ')}`);
    }
    return warnings;
  }
}
