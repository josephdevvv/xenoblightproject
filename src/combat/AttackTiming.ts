/**
 * GLOBAL ATTACK HIT-FRAME RULE (2026-11-22): every player and monster attack animation lands on its
 * FOURTH frame (1-based `impactFrame = 4`, 0-based index 3). The hit event, damage resolution and the
 * on-hit VFX are all synchronised to the moment that frame starts.
 *
 * The moment is computed from the animation's own timing (frame durations) - the combat system schedules
 * the hit on its clock from this delay, so animation playback never decides damage (a server can use the
 * same numbers). Pure, unit-tested.
 */
export const ATTACK_IMPACT_FRAME = 4;

/** 0-based frame index of the impact frame. */
export const ATTACK_IMPACT_INDEX = ATTACK_IMPACT_FRAME - 1;

/** True when an attack animation has enough frames for the global rule. */
export function supportsImpactFrame(frameCount: number, impactFrame = ATTACK_IMPACT_FRAME): boolean {
  return Number.isInteger(frameCount) && frameCount >= impactFrame;
}

/**
 * Milliseconds from the start of the animation until the impact frame starts (the sum of the frames
 * before it). `frameMs` is one duration for every frame, or a list of per-frame durations.
 */
export function impactDelayMs(frameMs: number | readonly number[], frameCount: number, impactFrame = ATTACK_IMPACT_FRAME): number {
  if (!supportsImpactFrame(frameCount, impactFrame)) throw new Error(`attack animation has ${frameCount} frames - the hit frame ${impactFrame} does not exist`);
  let total = 0;
  for (let i = 0; i < impactFrame - 1; i++) total += typeof frameMs === 'number' ? frameMs : frameMs[i];
  return total;
}
