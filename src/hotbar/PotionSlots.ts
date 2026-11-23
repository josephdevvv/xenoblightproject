import { itemDefinition } from '../items/ItemCatalog';
import type { HotbarState } from './Hotbar';

/**
 * The dedicated potion slots beside the hotbar - pure, unit-tested. Q holds an HP potion, W an SP potion (the SP
 * Recovery Potion). They are references like the hotbar (the quantity is read from the bag); assigning never uses
 * anything up. Kept in the save file (`potionSlots`, optional when reading).
 */
export type PotionSlotKey = 'hp' | 'sp';
export const POTION_SLOT_KEYS: readonly PotionSlotKey[] = ['hp', 'sp'];

export interface PotionSlots {
  readonly hp: string | null;
  readonly sp: string | null;
}

/** Key caps (labels) and KeyboardEvent.code of each slot. */
export const POTION_KEY_LABEL: Readonly<Record<PotionSlotKey, string>> = { hp: 'Q', sp: 'W' };
const KEY_CODES: Readonly<Record<string, PotionSlotKey>> = { KeyQ: 'hp', KeyW: 'sp' };

export function createPotionSlots(): PotionSlots {
  return { hp: null, sp: null };
}

/** Which slot an item belongs on: an HP potion (restores HP) on Q, an SP potion (restores SP) on W; else null. */
export function potionKind(itemId: string): PotionSlotKey | null {
  const def = itemDefinition(itemId);
  if (!def || def.category !== 'consumable' || !def.use) return null;
  if ((def.use.restoreHp ?? 0) > 0) return 'hp';
  if ((def.use.restoreSpPercent ?? 0) > 0) return 'sp';
  return null;
}

/** Top-row Q / W (KeyboardEvent.code, so it works on any layout); anything else null. */
export function potionSlotOfKey(code: string): PotionSlotKey | null {
  return KEY_CODES[code] ?? null;
}

/** Puts a potion on its own slot, replacing what was there. null = not a potion. */
export function assignPotion(slots: PotionSlots, itemId: string): { slots: PotionSlots; key: PotionSlotKey } | null {
  const key = potionKind(itemId);
  return key ? { slots: { ...slots, [key]: itemId }, key } : null;
}

/** Stored data -> valid slots: each must hold a known potion of its own kind (else it is emptied and reported). */
export function sanitizePotionSlots(raw: unknown): { state: PotionSlots; dropped: string[] } {
  const state = { ...createPotionSlots() };
  if (raw === undefined || raw === null) return { state, dropped: [] };
  if (typeof raw !== 'object') return { state, dropped: ['potionSlots'] };
  const d = raw as Record<string, unknown>;
  const dropped: string[] = [];
  for (const key of POTION_SLOT_KEYS) {
    const v = d[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && potionKind(v) === key) state[key] = v;
    else dropped.push(`potionSlots: ${key}`);
  }
  return { state, dropped };
}

/**
 * Files from before Q / W: a potion on the numbered hotbar moves to its own slot (the first one found; the others
 * of that kind are taken off 1-8 too, so a potion is never on two keys). Items are references: nothing is
 * duplicated or removed from the bag.
 */
export function migratePotionSlots(hotbar: HotbarState): { slots: PotionSlots; hotbar: HotbarState } {
  const slots = { ...createPotionSlots() };
  const next = hotbar.map((e) => {
    if (e?.type !== 'item') return e;
    const key = potionKind(e.itemId);
    if (!key) return e;
    if (slots[key] === null) slots[key] = e.itemId;
    return null;
  });
  return { slots, hotbar: next };
}
