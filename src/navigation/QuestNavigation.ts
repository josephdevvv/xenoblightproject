import type { Point } from '../core/types';
import { NPC_INTERACT_RANGE, type InteractableNpc, type InteractingPlayer } from '../npcs/NpcInteraction';

/** The parts of PlayerController quest navigation needs. */
export interface NavigatingPlayer extends InteractingPlayer {
  /** Stops at once and stands idle. */
  halt(): void;
}

export type NavigationStart = 'started' | 'arrived' | 'unreachable';

/**
 * Quest navigation ("Navigate" on the quest tracker) - pure, unit-tested. Walks the player to the NPC the current
 * quest leads to with the normal click-to-move pathfinding (never a teleport) and stops once inside the NPC's
 * interaction range, facing it (no conversation starts by itself). It is the player's own movement:
 *   - the same button while navigating stops it at once (path dropped, standing idle); the next click starts again,
 *   - a manual command (click on the ground / a monster / an NPC) cancels it - its own path replaces this one,
 *   - the quest NPC changing or disappearing, death or a conversation end it.
 * It never switches Auto Combat on or off.
 */
export class QuestNavigation<T extends InteractableNpc> {
  private target: T | null = null;

  constructor(private readonly player: NavigatingPlayer) {}

  get active(): boolean {
    return this.target !== null;
  }

  get npc(): T | null {
    return this.target;
  }

  /** Starts walking to `npc` (already in range: just faces it). */
  start(npc: T): NavigationStart {
    this.target = null;
    if (this.inRange(npc)) {
      this.player.stopPath();
      this.player.faceTowards(npc.position);
      return 'arrived';
    }
    if (!this.player.moveTo(npc.position)) return 'unreachable';
    this.target = npc;
    return 'started';
  }

  /** The button while navigating: stop at once, idle, nothing left to walk. */
  stop(): void {
    this.target = null;
    this.player.halt();
  }

  /** Something else took over the movement (a manual command): forget the target, keep the new path. */
  cancel(): void {
    this.target = null;
  }

  /** Every frame after the player moved. `questNpc`: where the quest leads now. 'arrived' once in range. */
  update(questNpc: T | null): 'arrived' | null {
    const npc = this.target;
    if (!npc) return null;
    if (npc !== questNpc) {
      this.stop(); // the quest moved on (or has no NPC to go to): nothing to navigate to any more
      return null;
    }
    if (this.inRange(npc)) {
      this.target = null;
      this.player.stopPath();
      this.player.faceTowards(npc.position);
      return 'arrived';
    }
    if (!this.player.hasPath()) this.target = null; // the way ended (blocked / given up) before the NPC
    return null;
  }

  private inRange(npc: { position: Point }): boolean {
    const p = this.player.getTilePosition();
    return Math.hypot(npc.position.x - p.x, npc.position.y - p.y) <= NPC_INTERACT_RANGE;
  }
}
