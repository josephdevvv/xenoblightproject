import type { ItemDefinition } from '../items/ItemDefinition';
import { itemDefinition } from '../items/ItemCatalog';
import { emptyDerivedBonus, type DerivedBonus } from '../status/DerivedBonuses';
import type { DerivedStats } from '../status/DerivedStats';
import { EQUIPMENT_SLOTS, INVENTORY_SLOT_COUNT, type EquipmentSlotId, type EquipOption } from './InventorySlots';
import { instanceToStack, newInstanceId, readOptions, stackToInstance, type ItemInstance, type ItemStack } from './ItemInstance';

/**
 * A character's items - pure rules, no Phaser, no storage, unit-tested. Functions never change the state
 * they are given; they return a new one.
 */
export interface InventoryState {
  /** INVENTORY_SLOT_COUNT entries. */
  readonly bag: readonly (ItemStack | null)[];
  /** The item instance worn in each slot. */
  readonly equipment: Readonly<Record<EquipmentSlotId, ItemInstance | null>>;
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

function emptyEquipment(): Record<EquipmentSlotId, ItemInstance | null> {
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

/**
 * Adds items: stackable ones onto their stack, the others one per free slot, each a new instance. All of them
 * or none. An instance is never put onto a stack.
 */
export function addItem(s: InventoryState, itemId: string, quantity: number, lookup: Lookup = itemDefinition): AddResult {
  const def = lookup(itemId);
  if (!def) return { ok: false, error: 'unknownItem' };
  if (!Number.isInteger(quantity) || quantity < 1) return { ok: false, error: 'invalidQuantity' };
  const bag = [...s.bag];
  const stackAt = def.stackable ? bag.findIndex((x) => x?.itemId === itemId && x.instanceId === undefined) : -1;
  if (stackAt >= 0) bag[stackAt] = { ...bag[stackAt]!, quantity: bag[stackAt]!.quantity + quantity };
  else {
    for (let left = def.stackable ? 1 : quantity; left > 0; left--) {
      const free = bag.indexOf(null);
      if (free < 0) return { ok: false, error: 'bagFull' };
      bag[free] = def.stackable ? { itemId, quantity } : instanceToStack({ itemId, instanceId: newInstanceId() });
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
 * Puts the item in a bag slot on. An item worn there - also another copy of the same one - goes back to
 * exactly that bag slot: one exchange of two instances in one new state, so nothing is lost, doubled or half
 * done, both keep their identity and options, and the bag never needs a free slot. Requirements are checked
 * first; on failure there is no new state.
 */
export function equipFromBag(s: InventoryState, bagIndex: number, slot: EquipmentSlotId, level: number, lookup: Lookup = itemDefinition): EquipResult {
  const stack = s.bag[bagIndex] ?? null;
  if (!stack) return { ok: false, error: 'emptySlot' };
  const def = lookup(stack.itemId);
  if (!def) return { ok: false, error: 'unknownItem' };
  if (def.category !== 'equipment' || def.equipmentSlot !== slot || stack.quantity !== 1) return { ok: false, error: 'wrongSlot' };
  if (level < def.requiredLevel) return { ok: false, error: 'levelTooLow' };
  const worn = s.equipment[slot];
  const item = stackToInstance(stack);
  if (worn?.instanceId === item.instanceId) return { ok: false, error: 'alreadyEquipped' };
  const bag = [...s.bag];
  bag[bagIndex] = worn ? instanceToStack(worn) : null;
  return { ok: true, state: { ...s, bag, equipment: { ...s.equipment, [slot]: item } } };
}

/**
 * How the item in a bag slot can be worn - decided by the same rules as equipFromBag, so what is offered is
 * what works. null = empty slot, or not something to wear.
 */
export function equipOption(s: InventoryState, bagIndex: number, level: number, lookup: Lookup = itemDefinition): EquipOption | null {
  const stack = s.bag[bagIndex] ?? null;
  const def = stack ? lookup(stack.itemId) : undefined;
  if (!def || def.category !== 'equipment') return null;
  const option = { slot: def.equipmentSlot, requiredLevel: def.requiredLevel };
  const result = equipFromBag(s, bagIndex, def.equipmentSlot, level, lookup);
  if (result.ok) return { ...option, problem: null };
  return result.error === 'levelTooLow' ? { ...option, problem: result.error } : null;
}

export type UnequipError = 'emptySlot' | 'bagFull';
export type UnequipResult = { ok: true; state: InventoryState; bagIndex: number } | { ok: false; error: UnequipError };

/** Moves the worn item of an equipment slot to the first free bag slot. Without one nothing changes. */
export function unequipToBag(s: InventoryState, slot: EquipmentSlotId): UnequipResult {
  const worn = s.equipment[slot];
  if (worn === null) return { ok: false, error: 'emptySlot' };
  const bagIndex = s.bag.indexOf(null);
  if (bagIndex < 0) return { ok: false, error: 'bagFull' };
  const bag = [...s.bag];
  bag[bagIndex] = instanceToStack(worn);
  return { ok: true, state: { ...s, bag, equipment: { ...s.equipment, [slot]: null } }, bagIndex };
}

/** Weapon types whose Physical ATK is melee. */
const MELEE_WEAPONS = new Set(['dagger']);

/**
 * Bonuses of the worn equipment, as one source of derived-stat bonuses (added to the formulas' results, which
 * stay as they are). Always computed from what is worn now, so an exchange can never stack bonuses. The game
 * splits physical attack into Melee and Ranged ATK: a weapon's Physical ATK counts for its own kind (dagger =
 * melee), other equipment for both.
 */
export function equipmentDerivedBonus(s: InventoryState | undefined, lookup: Lookup = itemDefinition): DerivedBonus {
  const out = emptyDerivedBonus();
  if (!s) return out;
  const add = (key: keyof DerivedStats, value: number): void => {
    if (value !== 0) out.flat[key] = (out.flat[key] ?? 0) + value;
  };
  for (const slot of EQUIPMENT_SLOTS) {
    const worn = s.equipment[slot];
    const def = worn ? lookup(worn.itemId) : undefined;
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
 * build may know them); a worn item that does not belong in its slot goes to the bag. `newIds`: instances that
 * had no (or a repeated) instance id and got one now - equipment saved before instances existed (worn items
 * were plain item ids); the caller saves the state so the ids stay.
 */
export function sanitizeInventory(raw: unknown, lookup: Lookup = itemDefinition): { state: InventoryState; repaired: string[]; newIds: number } {
  const repaired: string[] = [];
  const fresh = createInventory();
  if (typeof raw !== 'object' || raw === null) return { state: fresh, repaired: ['record'], newIds: 0 };
  const d = raw as { bag?: unknown; equipment?: unknown; grants?: unknown };

  let newIds = 0;
  const seen = new Set<string>();
  const instance = (itemId: string, e: { instanceId?: unknown; options?: unknown }): ItemInstance => {
    let instanceId = typeof e.instanceId === 'string' && e.instanceId !== '' ? e.instanceId : '';
    if (instanceId === '' || seen.has(instanceId)) {
      if (instanceId !== '') repaired.push(`${itemId}: instance id used twice`);
      instanceId = newInstanceId();
      newIds++;
    }
    seen.add(instanceId);
    const options = readOptions(e.options);
    return { itemId, instanceId, ...(options ? { options } : {}) };
  };

  const bag: (ItemStack | null)[] = [...fresh.bag];
  const overflow: ItemStack[] = [];
  const equipment = emptyEquipment();

  // Worn items first: they keep their instance id if the same id turns up again in the bag.
  const worn = (typeof d.equipment === 'object' && d.equipment !== null ? d.equipment : {}) as Record<string, unknown>;
  for (const slot of EQUIPMENT_SLOTS) {
    const value = worn[slot];
    const entry = (typeof value === 'string' ? { itemId: value } : value) as { itemId?: unknown; instanceId?: unknown; options?: unknown } | null | undefined;
    if (typeof entry?.itemId !== 'string' || entry.itemId === '') continue;
    const item = instance(entry.itemId, entry);
    const def = lookup(entry.itemId);
    if (!def || def.equipmentSlot === slot) equipment[slot] = item;
    else overflow.push(instanceToStack(item));
  }

  const stored = Array.isArray(d.bag) ? d.bag : [];
  if (!Array.isArray(d.bag)) repaired.push('bag');
  stored.forEach((value: unknown, i) => {
    if (value === null) return;
    const e = value as { itemId?: unknown; quantity?: unknown; instanceId?: unknown; options?: unknown } | undefined;
    if (typeof e?.itemId !== 'string' || e.itemId === '') {
      repaired.push(`bag ${i}`);
      return;
    }
    const quantity = Number.isInteger(e.quantity) && (e.quantity as number) >= 1 ? (e.quantity as number) : 1;
    if (quantity !== e.quantity) repaired.push(`bag ${i} quantity`);
    const def = lookup(e.itemId);
    const isInstance = def ? !def.stackable : e.instanceId !== undefined;
    const options = readOptions(e.options);
    const entry: ItemStack = isInstance ? instanceToStack(instance(e.itemId, e)) : { itemId: e.itemId, quantity, ...(options ? { options } : {}) };
    if (i < bag.length) bag[i] = entry;
    else overflow.push(entry);
    // several single items in one slot (broken data): one slot each
    if (isInstance && def) for (let n = 1; n < Math.min(quantity, INVENTORY_SLOT_COUNT); n++) overflow.push(instanceToStack(instance(e.itemId, {})));
  });

  for (const stack of overflow) {
    const free = bag.indexOf(null);
    repaired.push(`${stack.itemId} ${free < 0 ? 'had no room' : 'moved'}`);
    if (free >= 0) bag[free] = stack;
  }

  const grants = Array.isArray(d.grants) ? [...new Set(d.grants.filter((g): g is string => typeof g === 'string'))] : [];
  return { state: { bag, equipment, grants }, repaired, newIds };
}
