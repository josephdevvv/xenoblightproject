import { itemDefinition } from './ItemCatalog';

/** Why an item could not be used. */
export type UseProblem = 'notUsable' | 'dead' | 'none' | 'hpFull' | 'blocked';

export interface UseContext {
  /** The player is alive. */
  alive: boolean;
  /** How many the bag holds. */
  quantity: number;
  hp: number;
  maxHp: number;
  /** A tutorial step (or another rule) does not allow using items now. */
  blocked: boolean;
}

/**
 * Can one of this item be used now - pure, unit-tested. Everything is checked BEFORE anything is taken out of
 * the bag, so a refused use never costs an item. null = it can.
 */
export function useProblem(itemId: string, ctx: UseContext): UseProblem | null {
  const def = itemDefinition(itemId);
  if (!def || def.category !== 'consumable' || !def.use) return 'notUsable';
  if (!ctx.alive) return 'dead';
  if (ctx.blocked) return 'blocked';
  if (ctx.quantity < 1) return 'none';
  if (def.use.restoreHp > 0 && ctx.hp >= ctx.maxHp) return 'hpFull';
  return null;
}

/** HP one use restores now: never above max HP. */
export function hpRestored(itemId: string, hp: number, maxHp: number): number {
  const restore = itemDefinition(itemId)?.use?.restoreHp ?? 0;
  return Math.max(0, Math.min(restore, maxHp - hp));
}
