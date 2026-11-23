import { itemDefinition } from './ItemCatalog';

/** Why an item could not be used. */
export type UseProblem = 'notUsable' | 'dead' | 'none' | 'hpFull' | 'spFull' | 'blocked';

export interface UseContext {
  /** The player is alive. */
  alive: boolean;
  /** How many the bag holds. */
  quantity: number;
  hp: number;
  maxHp: number;
  /** SP now / max (SP items only; absent = full). */
  sp?: number;
  maxSp?: number;
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
  if ((def.use.restoreHp ?? 0) > 0 && ctx.hp >= ctx.maxHp) return 'hpFull';
  if ((def.use.restoreSpPercent ?? 0) > 0 && (ctx.sp ?? 0) >= (ctx.maxSp ?? 0)) return 'spFull';
  return null;
}

/** Why a skill scroll could not be used. */
export type ScrollProblem = 'notScroll' | 'dead' | 'blocked' | 'none' | 'alreadyLearned';

/**
 * Can a skill scroll be used now - pure. Checked BEFORE anything is taken out of the bag: a scroll is only ever
 * used up by teaching its skill, never for a skill the character already knows. null = it can.
 */
export function scrollProblem(itemId: string, ctx: { alive: boolean; blocked: boolean; quantity: number; learned: (skill: string) => boolean }): ScrollProblem | null {
  const def = itemDefinition(itemId);
  if (!def || def.category !== 'skill_scroll' || !def.teaches) return 'notScroll';
  if (!ctx.alive) return 'dead';
  if (ctx.blocked) return 'blocked';
  if (ctx.quantity < 1) return 'none';
  if (ctx.learned(def.teaches)) return 'alreadyLearned';
  return null;
}

/** SP one use restores now: the percent of max SP, rounded (as Heal's percent), never above max SP. */
export function spRestored(itemId: string, sp: number, maxSp: number): number {
  const percent = itemDefinition(itemId)?.use?.restoreSpPercent ?? 0;
  return Math.max(0, Math.min(Math.round((maxSp * percent) / 100), maxSp - sp));
}

/** HP one use restores now: never above max HP. */
export function hpRestored(itemId: string, hp: number, maxHp: number): number {
  const restore = itemDefinition(itemId)?.use?.restoreHp ?? 0;
  return Math.max(0, Math.min(restore, maxHp - hp));
}
