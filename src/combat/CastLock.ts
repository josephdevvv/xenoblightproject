import { combatSetFor, PLAYER_COMBAT_SETS } from '../characters/combat/PlayerCombatArt';
import type { PlayerAction } from '../player/death/PlayerLifeState';

/**
 * The cast lock (pure, unit-tested): while a self-cast such as Self-Heal plays, the character is held in it until
 * its last frame is over - no walking, no basic attack, no other cast, no talking to an NPC (nothing that would
 * switch the animation). The lock is a clock, like the hit timing: it runs for the cast clip's own length (frames x
 * frame time, from its export - 8 x 100 ms) and always runs out, so neither the animation nor the controls can get
 * stuck; death (and a respawn, a new scene) clears it at once.
 *
 * The same length for every appearance - one without combat art (no clip to show) is held just as long, so the art
 * never changes how a skill plays.
 */
export const CAST_LOCKED_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>(['move', 'attack', 'cast', 'interact']);

/** The reference cast clip (the approved self_heal_cast), used when an appearance has no combat art. */
const REFERENCE = Object.values(PLAYER_COMBAT_SETS)[0]?.actions.self_heal_cast ?? { frameMs: 100, frames: 8 };

/** How long a self-cast holds the character: its cast clip from the first frame to the end of the last. */
export function castLockMs(spriteId: string): number {
  const clip = combatSetFor(spriteId)?.actions.self_heal_cast ?? REFERENCE;
  return clip.frameMs * clip.frames;
}

export class CastLock {
  private remainingMs = 0;

  /** Holds the character for `ms` from now (a longer lock already running is kept). */
  lock(ms: number): void {
    if (Number.isFinite(ms) && ms > this.remainingMs) this.remainingMs = ms;
  }

  /** Per frame, on the game clock. Returns true on the frame the lock runs out. */
  update(deltaMs: number): boolean {
    if (this.remainingMs <= 0) return false;
    this.remainingMs = Math.max(0, this.remainingMs - (Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0));
    return this.remainingMs === 0;
  }

  get locked(): boolean {
    return this.remainingMs > 0;
  }

  /** May the player do this now? Everything a cast lock does not hold (potions, chat, windows) stays allowed. */
  allows(action: PlayerAction): boolean {
    return !this.locked || !CAST_LOCKED_ACTIONS.has(action);
  }

  /** Death, respawn: the lock is gone at once. */
  clear(): void {
    this.remainingMs = 0;
  }
}
