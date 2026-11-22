/**
 * What the Inventory window shows - pure, no Phaser. The window reads and changes items through
 * InventorySource only (a character's items: CharacterInventorySource).
 */

/** Equipment slots, in reading order. */
export const EQUIPMENT_SLOTS = ['weapon', 'hat', 'armor', 'shoes', 'charm'] as const;
export type EquipmentSlotId = (typeof EQUIPMENT_SLOTS)[number];

export const INVENTORY_GRID = { columns: 6, rows: 6 } as const;
export const INVENTORY_SLOT_COUNT = INVENTORY_GRID.columns * INVENTORY_GRID.rows;

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
}

/** Why an item could not be taken off. */
export type UnequipProblem = 'emptySlot' | 'bagFull' | 'notSaved' | 'notAllowed';

export interface InventorySource {
  itemAt(slot: SlotRef): ItemInfo | null;
  /** Equips the item in a bag slot. False = not possible, nothing changed. */
  equip(bagIndex: number, slot: EquipmentSlotId): boolean;
  /** Takes off the item in an equipment slot: the bag slot it went to, or the reason nothing changed. */
  unequip(slot: EquipmentSlotId): { bagIndex: number } | { error: UnequipProblem };
  /** Items may be taken off now. */
  canUnequip(): boolean;
  /** Calls `listener` after every change; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/** Every slot empty. */
export const EMPTY_INVENTORY: InventorySource = {
  itemAt: () => null,
  equip: () => false,
  unequip: () => ({ error: 'emptySlot' }),
  canUnequip: () => false,
  onChange: () => () => undefined,
};

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
