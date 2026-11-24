import { combatSetFor, PLAYER_COMBAT_SETS, PLAYER_IMPACT_VFX } from '../characters/combat/PlayerCombatArt';
import { ATTACK_IMPACT_FRAME, impactDelayMs } from './AttackTiming';

/**
 * Player attacks. Both use the Drifter's `dagger_thrust` animation (8 frames, 100 ms) and land on the
 * global hit frame 4. The Lv.1 attack skill only changes the damage multiplier and the impact VFX scale.
 *
 * Note: the Sprite Forge export still records `impactFrame: 5` for dagger_thrust (written before the global
 * frame-4 rule) - the game uses ATTACK_IMPACT_FRAME; re-export from the forge to update the record.
 */
export type PlayerAttackId = 'basic' | 'drifter_lv1';

export interface PlayerAttackDefinition {
  id: PlayerAttackId;
  animation: 'dagger_thrust';
  /** 1-based frame on which the hit lands. */
  impactFrame: number;
  /** x ATK (1 = normal attack, 2 = 200 % ATK). */
  atkMultiplier: number;
  onHitVfx: 'impact';
  vfxScale: number;
}

export const PLAYER_ATTACKS: Readonly<Record<PlayerAttackId, PlayerAttackDefinition>> = {
  basic: { id: 'basic', animation: 'dagger_thrust', impactFrame: ATTACK_IMPACT_FRAME, atkMultiplier: 1, onHitVfx: 'impact', vfxScale: PLAYER_IMPACT_VFX.scales.basicAttack },
  drifter_lv1: { id: 'drifter_lv1', animation: 'dagger_thrust', impactFrame: ATTACK_IMPACT_FRAME, atkMultiplier: 2, onHitVfx: 'impact', vfxScale: PLAYER_IMPACT_VFX.scales.enhancedAttackSkill },
};

/** The reference Drifter timing (the approved dagger_thrust), used when an appearance has no combat art. */
const REFERENCE = Object.values(PLAYER_COMBAT_SETS)[0]?.actions.dagger_thrust ?? { frameMs: 100, frames: 8 };

/** ms from the start of the swing until the hit frame, from the appearance's own animation timing. */
export function playerImpactDelayMs(spriteId: string, attack: PlayerAttackDefinition): number {
  const sheet = combatSetFor(spriteId)?.actions[attack.animation] ?? REFERENCE;
  return impactDelayMs(sheet.frameMs, sheet.frames, attack.impactFrame);
}

/** The whole swing (every frame) at its authored speed, in ms. */
export function playerSwingMs(spriteId: string, attack: PlayerAttackDefinition): number {
  const sheet = combatSetFor(spriteId)?.actions[attack.animation] ?? REFERENCE;
  return sheet.frameMs * sheet.frames;
}

/**
 * Swing playback speed for an attack interval (ASPD): the authored speed while the whole swing fits in the
 * interval, faster when it does not (an 800-ms swing at a 400-ms interval plays x2), never slower. The hit
 * frame moves with it: hit delay = authored delay / speed - so the animation and the hit stay in sync.
 */
export function swingTimeScale(swingMs: number, intervalMs: number): number {
  return intervalMs > 0 && swingMs > intervalMs ? swingMs / intervalMs : 1;
}
