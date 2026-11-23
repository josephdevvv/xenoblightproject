import { itemDefinition } from '../items/ItemCatalog';
import { isActiveSkillId } from '../skills/ActiveSkills';

/**
 * The hotbar - pure rules, no Phaser, unit-tested. Exactly 8 slots, used with the TOP ROW keys 1-8 (never the
 * numpad). A slot holds a REFERENCE, never an item: an item entry points at a consumable by id (its quantity is
 * read from the bag), a skill entry at an active skill (usable only when unlocked - see ActiveSkills).
 * Kept in the character and in save files; nothing else stores it.
 */
export const HOTBAR_SIZE = 8;

export type HotbarEntry = { readonly type: 'item'; readonly itemId: string } | { readonly type: 'skill'; readonly skillId: string };
export type HotbarState = readonly (HotbarEntry | null)[];

export function createHotbar(): HotbarState {
  return Array.from({ length: HOTBAR_SIZE }, () => null);
}

/** An item that can be put on the hotbar (a consumable). */
export function isHotbarItem(itemId: string): boolean {
  return itemDefinition(itemId)?.category === 'consumable';
}

export function isValidSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < HOTBAR_SIZE;
}

/** The slot an item is on, or -1. */
export function slotOfItem(state: HotbarState, itemId: string): number {
  return state.findIndex((e) => e?.type === 'item' && e.itemId === itemId);
}

/**
 * Puts an item on a slot (whatever was there is replaced). An item is on one slot at a time: assigning it again
 * moves it. null = not possible (not a consumable, no such slot); nothing changes.
 */
export function assignItem(state: HotbarState, slot: number, itemId: string): HotbarState | null {
  if (!isValidSlot(slot) || !isHotbarItem(itemId)) return null;
  const next = state.map((e) => (e?.type === 'item' && e.itemId === itemId ? null : e));
  next[slot] = { type: 'item', itemId };
  return next;
}

export function clearSlot(state: HotbarState, slot: number): HotbarState {
  if (!isValidSlot(slot)) return state;
  const next = [...state];
  next[slot] = null;
  return next;
}

/**
 * Stored data -> a valid hotbar. Exactly 8 slots; entries that are not an item or skill this build knows
 * (or that are not assignable) are dropped and listed, never trusted. Missing data = an empty hotbar.
 */
export function sanitizeHotbar(raw: unknown): { state: HotbarState; dropped: string[] } {
  const state = [...createHotbar()];
  const dropped: string[] = [];
  if (raw === undefined || raw === null) return { state, dropped };
  if (!Array.isArray(raw)) return { state, dropped: ['hotbar'] };
  const seenItems = new Set<string>();
  raw.slice(0, HOTBAR_SIZE).forEach((e, slot) => {
    if (e === null || e === undefined) return;
    const d = e as { type?: unknown; itemId?: unknown; skillId?: unknown };
    if (d.type === 'item' && typeof d.itemId === 'string' && isHotbarItem(d.itemId) && !seenItems.has(d.itemId)) {
      seenItems.add(d.itemId);
      state[slot] = { type: 'item', itemId: d.itemId };
    } else if (d.type === 'skill' && typeof d.skillId === 'string' && isActiveSkillId(d.skillId)) {
      state[slot] = { type: 'skill', skillId: d.skillId };
    } else dropped.push(`hotbar slot ${slot + 1}`);
  });
  if (raw.length > HOTBAR_SIZE) dropped.push('hotbar: extra slots');
  return { state, dropped };
}

/** Top-row digit key of a slot: KeyboardEvent.code "Digit1".."Digit8" -> 0..7; anything else (Numpad1 too) -> -1. */
export function hotbarSlotOfKey(code: string): number {
  const m = /^Digit([1-8])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}
