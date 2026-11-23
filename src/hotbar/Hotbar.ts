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

/** The same item / skill. */
export function sameEntry(a: HotbarEntry | null, b: HotbarEntry | null): boolean {
  if (!a || !b) return a === b;
  return a.type === 'item' ? b.type === 'item' && a.itemId === b.itemId : b.type === 'skill' && a.skillId === b.skillId;
}

/** The slot an entry is on, or -1. */
export function slotOfEntry(state: HotbarState, entry: HotbarEntry): number {
  return state.findIndex((e) => sameEntry(e, entry));
}

/**
 * Puts an item or a skill on a slot (whatever was there is replaced). Each is on one slot at a time: assigning it
 * again moves it; items and skills share the 8 slots. null = not possible (not a consumable / skill, no such
 * slot); nothing changes. (Whether a skill is learned is HotbarService's check.)
 */
export function assignEntry(state: HotbarState, slot: number, entry: HotbarEntry): HotbarState | null {
  if (!isValidSlot(slot)) return null;
  if (entry.type === 'item' ? !isHotbarItem(entry.itemId) : !isActiveSkillId(entry.skillId)) return null;
  const next = state.map((e) => (sameEntry(e, entry) ? null : e));
  next[slot] = entry.type === 'item' ? { type: 'item', itemId: entry.itemId } : { type: 'skill', skillId: entry.skillId };
  return next;
}

/** An item on a slot (see assignEntry). */
export function assignItem(state: HotbarState, slot: number, itemId: string): HotbarState | null {
  return assignEntry(state, slot, { type: 'item', itemId });
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
  const seenSkills = new Set<string>();
  raw.slice(0, HOTBAR_SIZE).forEach((e, slot) => {
    if (e === null || e === undefined) return;
    const d = e as { type?: unknown; itemId?: unknown; skillId?: unknown };
    if (d.type === 'item' && typeof d.itemId === 'string' && isHotbarItem(d.itemId) && !seenItems.has(d.itemId)) {
      seenItems.add(d.itemId);
      state[slot] = { type: 'item', itemId: d.itemId };
    } else if (d.type === 'skill' && typeof d.skillId === 'string' && isActiveSkillId(d.skillId) && !seenSkills.has(d.skillId)) {
      seenSkills.add(d.skillId);
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
