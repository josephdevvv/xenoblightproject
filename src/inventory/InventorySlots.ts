/**
 * What the Inventory window shows - pure, no Phaser. The window reads and changes items through
 * InventorySource only (a character's items: CharacterInventorySource).
 */

/** Equipment slots, in reading order. */
export const EQUIPMENT_SLOTS = ['weapon', 'hat', 'armor', 'shoes', 'charm'] as const;
export type EquipmentSlotId = (typeof EQUIPMENT_SLOTS)[number];

/** Bag capacity: 100 slots (no weight system). */
export const INVENTORY_SLOT_COUNT = 100;
/** The bag grid of the Inventory window: 6 columns, 6 rows visible at a time - it scrolls by rows. */
export const INVENTORY_GRID = { columns: 6, rows: 6 } as const;
/** Rows of the whole bag (the last one may be partly filled: 100 = 16 x 6 + 4). */
export const INVENTORY_ROWS = Math.ceil(INVENTORY_SLOT_COUNT / INVENTORY_GRID.columns);
/** The highest first visible row. */
export const MAX_BAG_SCROLL = Math.max(0, INVENTORY_ROWS - INVENTORY_GRID.rows);

/** First visible row, clamped. */
export function clampBagScroll(row: number): number {
  return Math.min(MAX_BAG_SCROLL, Math.max(0, Math.round(Number.isFinite(row) ? row : 0)));
}

/** The first visible row that shows bag slot `index`, moving as little as possible from `row`. */
export function bagScrollToShow(row: number, index: number): number {
  const r = Math.floor(index / INVENTORY_GRID.columns);
  if (r < row) return clampBagScroll(r);
  if (r >= row + INVENTORY_GRID.rows) return clampBagScroll(r - INVENTORY_GRID.rows + 1);
  return clampBagScroll(row);
}

/** One slot of the window. */
export type SlotRef = { readonly kind: 'equipment'; readonly slot: EquipmentSlotId } | { readonly kind: 'bag'; readonly index: number };

export function sameSlot(a: SlotRef | null, b: SlotRef | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === 'equipment' ? b.kind === 'equipment' && a.slot === b.slot : b.kind === 'bag' && a.index === b.index;
}

export function isValidSlot(s: SlotRef): boolean {
  return s.kind === 'equipment' ? EQUIPMENT_SLOTS.includes(s.slot) : Number.isInteger(s.index) && s.index >= 0 && s.index < INVENTORY_SLOT_COUNT;
}

/** What the description panel shows of an item (texts already in the player's language). */
export interface ItemInfo {
  name: string;
  type: string;
  description: string;
  /** Stats / effects, one line each. */
  effects: readonly string[];
  icon: { texture: string; frame?: string | number } | null;
  /** How many lie in this slot - stackable items (consumables) only; absent for equipment and skill scrolls. */
  quantity?: number;
}

/** Where a bag item is worn, and why it cannot be worn now (null = it can). */
export interface EquipOption {
  slot: EquipmentSlotId;
  requiredLevel: number;
  problem: 'levelTooLow' | null;
}

/** Why an item could not be taken off. */
export type UnequipProblem = 'emptySlot' | 'bagFull' | 'notAllowed';

export interface InventorySource {
  itemAt(slot: SlotRef): ItemInfo | null;
  /** How the item in a bag slot can be worn; null = empty or not wearable. */
  equipOption(bagIndex: number): EquipOption | null;
  /** Equips the item in a bag slot. False = not possible, nothing changed. */
  equip(bagIndex: number, slot: EquipmentSlotId): boolean;
  /** Takes off the item in an equipment slot: the bag slot it went to, or the reason nothing changed. */
  unequip(slot: EquipmentSlotId): { bagIndex: number } | { error: UnequipProblem };
  /** Items may be taken off now. */
  canUnequip(): boolean;
  /** Calls `listener` after every change; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
  /** The consumable in a bag slot (its item id), or null. Absent = no consumables. */
  consumableAt?(bagIndex: number): string | null;
  /** The skill scroll in a bag slot (its item id), or null. */
  scrollAt?(bagIndex: number): string | null;
}

/** Every slot empty. */
export const EMPTY_INVENTORY: InventorySource = {
  itemAt: () => null,
  equipOption: () => null,
  equip: () => false,
  unequip: () => ({ error: 'emptySlot' }),
  canUnequip: () => false,
  onChange: () => () => undefined,
};

/** What can be done with the item in a slot: equip / unequip, or use / assign a hotkey for a consumable. */
export type SlotAction = ({ kind: 'equip' } & EquipOption) | { kind: 'unequip' } | { kind: 'consumable'; itemId: string } | { kind: 'scroll'; itemId: string };

/** Bag item that can be worn -> equip; worn item -> unequip; consumable -> use + hotkey; anything else -> nothing. */
export function slotAction(source: InventorySource, slot: SlotRef | null): SlotAction | null {
  if (!slot || !source.itemAt(slot)) return null;
  if (slot.kind === 'equipment') return source.canUnequip() ? { kind: 'unequip' } : null;
  const consumable = source.consumableAt?.(slot.index) ?? null;
  if (consumable) return { kind: 'consumable', itemId: consumable };
  const scroll = source.scrollAt?.(slot.index) ?? null;
  if (scroll) return { kind: 'scroll', itemId: scroll };
  const option = source.equipOption(slot.index);
  return option ? { kind: 'equip', ...option } : null;
}

/** The selected slot of the window: at most one over equipment and bag together. */
export class SlotSelection {
  private selected: SlotRef | null = null;
  private readonly listeners = new Set<(slot: SlotRef | null) => void>();

  get current(): SlotRef | null {
    return this.selected;
  }

  isSelected(slot: SlotRef): boolean {
    return sameSlot(this.selected, slot);
  }

  select(slot: SlotRef | null): void {
    if (slot && !isValidSlot(slot)) return;
    if (sameSlot(slot, this.selected)) return;
    this.selected = slot;
    for (const l of this.listeners) l(slot);
  }

  clear(): void {
    this.select(null);
  }

  onChange(listener: (slot: SlotRef | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
