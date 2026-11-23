import type { EquipmentSlotId } from '../inventory/InventorySlots';
import { createInventory, type InventoryState } from '../inventory/InventoryState';
import { newInstanceId } from '../inventory/ItemInstance';
import { itemDefinition } from './ItemCatalog';

/**
 * What a NEW character wears from the start (New Game only - loaded saves and older characters get nothing).
 * Each entry becomes one new item instance, worn in its slot; nothing goes to the bag. It does not change the
 * character's look: the approved Drifter sprites already show their clothes.
 */
export const STARTING_EQUIPMENT: readonly { slot: EquipmentSlotId; itemId: string }[] = [{ slot: 'armor', itemId: 'armor_worn_cloth' }];

/** A new character's inventory: empty bag, the starting equipment worn (fresh instance ids). */
export function startingInventory(newId: () => string = newInstanceId): InventoryState {
  const inventory = createInventory();
  const equipment = { ...inventory.equipment };
  for (const { slot, itemId } of STARTING_EQUIPMENT) {
    const def = itemDefinition(itemId);
    if (!def || def.category !== 'equipment' || def.equipmentSlot !== slot) throw new Error(`starting equipment ${itemId} does not fit the ${slot} slot`);
    equipment[slot] = { itemId, instanceId: newId() };
  }
  return { ...inventory, equipment };
}
