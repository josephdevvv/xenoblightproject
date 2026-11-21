/**
 * The player's life cycle - pure (no Phaser), unit-tested:
 *
 *   alive --die()--> dying --finishDying()--> dead --requestRespawn()--> respawning --finishRespawn()--> alive
 *
 * Every transition is only accepted from its own state, so HP reaching 0 twice, a second respawn click or a
 * late timer can never start the flow again. While not alive, PlayerLife.canPerform() is the single gate for
 * gameplay actions: only chat is allowed (no chat exists yet - the gate is ready for it).
 */
export type LifeState = 'alive' | 'dying' | 'dead' | 'respawning';

/** Everything the player can try to do. New actions must be added here so the dead state blocks them. */
export type PlayerAction = 'move' | 'attack' | 'cast' | 'interact' | 'loot' | 'useItem' | 'openWindow' | 'chat';

/** Actions allowed while dying / dead / respawning. Chat only. */
export const DEAD_ALLOWED_ACTIONS: ReadonlySet<PlayerAction> = new Set<PlayerAction>(['chat']);

export class PlayerLife {
  private current: LifeState = 'alive';
  private deathCount = 0;
  private respawnCount = 0;
  private readonly listeners = new Set<(state: LifeState) => void>();

  get state(): LifeState {
    return this.current;
  }

  get deaths(): number {
    return this.deathCount;
  }

  get respawns(): number {
    return this.respawnCount;
  }

  isAlive(): boolean {
    return this.current === 'alive';
  }

  /** Gameplay action gate: everything while alive, chat only otherwise. */
  canPerform(action: PlayerAction): boolean {
    return this.current === 'alive' || DEAD_ALLOWED_ACTIONS.has(action);
  }

  /** HP reached 0. Returns false (ignored) unless the player is alive. */
  die(): boolean {
    if (this.current !== 'alive') return false;
    this.deathCount++;
    return this.set('dying');
  }

  /** The dissolve / ghost transition finished. */
  finishDying(): boolean {
    return this.current === 'dying' && this.set('dead');
  }

  /** The respawn button was clicked. Only the first click while dead is accepted. */
  requestRespawn(): boolean {
    return this.current === 'dead' && this.set('respawning');
  }

  /** The player stands at the save point again. */
  finishRespawn(): boolean {
    if (this.current !== 'respawning') return false;
    this.respawnCount++;
    return this.set('alive');
  }

  onChange(listener: (state: LifeState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(state: LifeState): true {
    this.current = state;
    for (const l of this.listeners) l(state);
    return true;
  }
}
