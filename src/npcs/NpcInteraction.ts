import type { Point } from '../core/types';

/** How close (tile centre to player, tiles) the player must be to talk to an NPC. */
export const NPC_INTERACT_RANGE = 1.5;

export interface InteractableNpc {
  readonly position: Point;
}

/** The nearest of `npcs` within talking range of `me` (tile space), or null. Pure - the mobile talk button uses it. */
export function nearestInRange<T extends InteractableNpc>(npcs: readonly T[], me: Point, range = NPC_INTERACT_RANGE): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const npc of npcs) {
    const d = Math.hypot(npc.position.x - me.x, npc.position.y - me.y);
    if (d <= range && d < bestDistance) {
      best = npc;
      bestDistance = d;
    }
  }
  return best;
}

/** The parts of PlayerController this needs. */
export interface InteractingPlayer {
  getTilePosition(): Point;
  moveTo(goal: Point): boolean;
  stopPath(): void;
  hasPath(): boolean;
  faceTowards(p: Point): void;
}

/**
 * Left click on an NPC that has something to say: in range the interaction starts at once; otherwise the
 * player walks there (the normal click-to-move pathfinding - never a teleport) and it starts on arrival.
 * Anything else the player does (another click, dying) cancels it, and an NPC that cannot be reached
 * is given up.
 */
export class NpcInteraction<T extends InteractableNpc> {
  private pending: T | null = null;

  constructor(
    private readonly player: InteractingPlayer,
    private readonly onInteract: (npc: T) => void,
  ) {}

  /** Returns false when the NPC cannot be reached. */
  request(npc: T): boolean {
    this.pending = null;
    if (this.inRange(npc)) {
      this.start(npc);
      return true;
    }
    if (!this.player.moveTo(npc.position)) return false;
    this.pending = npc;
    return true;
  }

  cancel(): void {
    this.pending = null;
  }

  get target(): T | null {
    return this.pending;
  }

  /** Every frame, after the player moved. */
  update(): void {
    const npc = this.pending;
    if (!npc) return;
    if (this.inRange(npc)) this.start(npc);
    else if (!this.player.hasPath()) this.pending = null; // the way ended too far away
  }

  private inRange(npc: T): boolean {
    const p = this.player.getTilePosition();
    return Math.hypot(npc.position.x - p.x, npc.position.y - p.y) <= NPC_INTERACT_RANGE;
  }

  private start(npc: T): void {
    this.pending = null;
    this.player.stopPath();
    this.player.faceTowards(npc.position);
    this.onInteract(npc);
  }
}
