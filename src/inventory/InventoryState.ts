import type { ItemDefinition } from '../items/ItemDefinition';
import { itemDefinition } from '../items/ItemCatalog';
import { emptyDerivedBonus, type DerivedBonus } from '../status/DerivedBonuses';
import type { DerivedStats } from '../status/DerivedStats';
import { EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT, type EquipmentSlotId } from './InventorySlots';

/**
 * A character's items - pure rules, no Phaser, no storage, unit-tested. Functions never change the state
 * they are given; they return a new one.
 */
export interface ItemStack {
  readonly itemId: string;
  readonly quantity: number;
}

export interface InventoryState {
  /** INVENTORY_SLOT_COUNT entries. */
  readonly bag: readonly (ItemStack | null)[];
  /** Item id worn in each slot. */
  readonly equipment: Readonly<Record<EquipmentSlotId, string | null>>;
  /**
   * Ids of one-time grants already received (quest rewards). Kept in the same record as the items, so "got
   * it" and "has it" can only be saved together.
   */
  readonly grants: readonly string[];
}

type Lookup = (itemId: string) => ItemDefinition | undefined;

export function createInventory(): InventoryState {
  return { bag: Array.from({ length: INVENTORY_SLOT_COUNT }, () => null), equipment: emptyEquipment(), grants: [] };
}

function emptyEquipment(): Record<EquipmentSlotId, string | null> {
  return { weapon: null, hat: null, armor: null, shoes: null, charm: null };
}

export function hasGrant(s: InventoryState | undefined, grantId: string): boolean {
  return s?.grants.includes(grantId) ?? false;
}

/** First bag slot holding an item, or -1. */
export function bagIndexOf(s: InventoryState | undefined, itemId: string): number {
  return s ? s.bag.findIndex((stack) => stack?.itemId === itemId) : -1;
}

export type AddError = 'unknownItem' | 'invalidQuantity' | 'bagFull';
export type AddResult = { ok: true; state: InventoryState } | { ok: false; error: AddError };

/** Adds items: stackable ones onto their stack, the others one per free slot. All of them or none. */
export function addItem(s: InventoryState, itemId: string, quantity: number, lookup: Lookup = itemDefinition): AddResult {
  const def = lookup(itemId);
  if (!def) return { ok: false, error: 'unknownItem' };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: 'invalidQuantity' };
  const bag = [...s.bag];
  const stackAt = def.stackable ? bag.findIndex((x) => x?.itemId === itemId) : -1;
  if (stackAt >= 0) bag[stackAt] = { itemId, quantity: bag[stackAt]!.quantity + quantity };
  else {
    for (let left = def.stackable ? 1 : quantity; left > 0; left--) {
      const free = bag.indexOf(null);
      if (free < 0) return { ok: false, error: 'bagFull' };
      bag[free] = { itemId, quantity: def.stackable ? quantity : 1 };
    }
  }
  return { ok: true, state: { ...s, bag } };
}

export type GrantError = AddError | 'alreadyGranted';
export type GrantStep = { ok: true; state: InventoryState } | { ok: false; error: GrantError };

/** Adds items at most once per grant id: the id is recorded together with the items. */
export function grantOnce(s: InventoryState, grantId: string, itemId: string, quantity: number, lookup: Lookup = itemDefinition): GrantStep {
  if (hasGrant(s, grantId)) return { ok: false, error: 'alreadyGranted' };
  const added = addItem(s, itemId, quantity, lookup);
  return added.ok ? { ok: true, state: { ...added.state, grants: [...added.state.grants, grantId] } } : added;
}

export type EquipError = 'emptySlot' | 'unknownItem' | 'wrongSlot' | 'levelTooLow' | 'alreadyEquipped';
export type EquipResult = { ok: true; state: InventoryState } | { ok: false; error: EquipError };

/**
 * Moves the item in a bag slot to its equipment slot. What was worn there goes back to that bag slot, so
 * nothing is lost or doubled and the bag never needs a free slot.
 */
export function equipFromBag(s: InventoryState, bagIndex: number, slot: EquipmentSlotId, level: number, lookup: Lookup = itemDefinition): EquipResult {
  const stack = s.bag[bagIndex] ?? null;
  if (!stack) return { ok: false, error: 'emptySlot' };
  const def = lookup(stack.itemId);
  if (!def) return { ok: false, error: 'unknownItem' };
  if (def.category !== 'equipment' || def.equipmentSlot !== slot || stack.quantity !== 1) return { ok: false, error: 'wrongSlot' };
  if (level < def.requiredLevel) return { ok: false, error: 'levelTooLow' };
  const worn = s.equipment[slot];
  if (worn === stack.itemId) return { ok: false, error: 'alreadyEquipped' };
  const bag = [...s.bag];
  bag[bagIndex] = worn === null ? null : { itemId: worn, quantity: 1 };
  return { ok: true, state: { ...s, bag, equipment: { ...s.equipment, [slot]: stack.itemId } } };
}

export type UnequipError = 'emptySlot' | 'bagFull';
export type UnequipResult = { ok: true; state: InventoryState; bagIndex: number } | { ok: false; error: UnequipError };

/** Moves the worn item of an equipment slot to the first free bag slot. Without one nothing changes. */
export function unequipToBag(s: InventoryState, slot: EquipmentSlotId): UnequipResult {
  const itemId = s.equipment[slot];
  if (itemId === null) return { ok: false, error: 'emptySlot' };
  const bagIndex = s.bag.indexOf(null);
  if (bagIndex < 0) return { ok: false, error: 'bagFull' };
  const bag = [...s.bag];
  bag[bagIndex] = { itemId, quantity: 1 };
  return { ok: true, state: { ...s, bag, equipment: { ...s.equipment, [slot]: null } }, bagIndex };
}

/** Weapon types whose Physical ATK is melee. */
const MELEE_WEAPONS = new Set(['dagger']);

/**
 * Bonuses of the worn equipment, as one source of derived-stat bonuses (added to the formulas' results, which
 * stay as they are). The game splits physical attack into Melee and Ranged ATK: a weapon's Physical ATK
 * counts for its own kind (dagger = melee), other equipment for both.
 */
export function equipmentDerivedBonus(s: InventoryState | undefined, lookup: Lookup = itemDefinition): DerivedBonus {
  const out = emptyDerivedBonus();
  if (!s) return out;
  const add = (key: keyof DerivedStats, value: number): void => {
    if (value !== 0) out.flat[key] = (out.flat[key] ?? 0) + value;
  };
  for (const slot of EQUIPMENT_SLOTS) {
    const id = s.equipment[slot];
    const def = id === null ? undefined : lookup(id);
    if (!def) continue;
    if (def.weaponType === null || MELEE_WEAPONS.has(def.weaponType)) add('meleeAtk', def.bonuses.physicalAtk);
    if (def.weaponType === null || !MELEE_WEAPONS.has(def.weaponType)) add('rangedAtk', def.bonuses.physicalAtk);
    add('matk', def.bonuses.magicAtk);
    for (const [key, value] of Object.entries(def.additionalStats) as [keyof DerivedStats, number][]) add(key, value);
  }
  return out;
}

/**
 * Stored data (any shape) -> valid state. Items this build does not know are kept where they are (a newer
 * build may know them); a worn item that does not belong in its slot goes to the bag.
 */
export function sanitizeInventory(raw: unknown, lookup: Lookup = itemDefinition): { state: InventoryState; repaired: string[] } {
  const repaired: string[] = [];
  const fresh = createInventory();
  if (typeof raw !== 'object' || raw === null) return { state: fresh, repaired: ['record'] };
  const d = raw as { bag?: unknown; equipment?: unknown; grants?: unknown };

  const bag: (ItemStack | null)[] = [...fresh.bag];
  const stored = Array.isArray(d.bag) ? d.bag : [];
  if (!Array.isArray(d.bag)) repaired.push('bag');
  const overflow: ItemStack[] = [];
  stored.forEach((entry: unknown, i) => {
    if (entry === null) return;
    const e = entry as Partial<ItemStack> | undefined;
    if (typeof e?.itemId !== 'string' || e.itemId === '') {
      repaired.push(`bag ${i}`);
      return;
    }
    const quantity = Number.isInteger(e.quantity) && (e.quantity as number) >= 1 ? (e.quantity as number) : 1;
    if (quantity !== e.quantity) repaired.push(`bag ${i} quantity`);
    if (i < bag.length) bag[i] = { itemId: e.itemId, quantity };
    else overflow.push({ itemId: e.itemId, quantity });
  });

  const equipment = emptyEquipment();
  const worn = (typeof d.equipment === 'object' && d.equipment !== null ? d.equipment : {}) as Record<string, unknown>;
  for (const slot of EQUIPMENT_SLOTS) {
    const id = worn[slot];
    if (typeof id !== 'string' || id === '') continue;
    const def = lookup(id);
    if (!def || def.equipmentSlot === slot) equipment[slot] = id;
    else overflow.push({ itemId: id, quantity: 1 });
  }
  for (const stack of overflow) {
    const free = bag.indexOf(null);
    repaired.push(`${stack.itemId} ${free < 0 ? 'had no room' : 'moved'}`);
    if (free >= 0) bag[free] = stack;
  }

  const grants = Array.isArray(d.grants) ? [...new Set(d.grants.filter((g): g is string => typeof g === 'string'))] : [];
  return { state: { bag, equipment, grants }, repaired };
}
