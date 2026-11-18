/**
 * Tunable performance budgets. Budgets only produce (dev) warnings / debug-overlay highlights;
 * they never change gameplay.
 */
export const PERFORMANCE_CONFIG = {
  budgets: {
    /** Target frame time; frames above this count as "over budget" (60 FPS + 25% slack). */
    frameTimeMs: 1000 / 60 * 1.25,
    /** Warn when the active scenes hold more display objects than this. */
    maxGameObjects: 4000,
    /** Warn when more characters than this are visible at once (future multiplayer). */
    maxVisibleCharacters: 64,
    /** Max milliseconds per frame spent creating map objects during a map build. */
    mapBuildSliceMs: 6,
  },
  culling: {
    /** Extra pixels around the camera view kept visible (covers camera lag and tall sprites). */
    marginPx: 192,
    /** Skip re-culling until the camera has moved at least this far. */
    minCameraMovePx: 16,
  },
  /** Distance bands (px from the camera centre) for future update priorities. */
  priority: {
    highRadiusPx: 640,
    mediumRadiusPx: 1280,
    lowRadiusPx: 2048,
  },
  /** Minimum ms between repeated budget warnings in the console. */
  warningIntervalMs: 5000,
} as const;
