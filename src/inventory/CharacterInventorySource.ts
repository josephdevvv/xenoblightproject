import type { CharacterData } from '../data/CharacterData';
import { itemInfo } from '../items/ItemInfoText';
import type { InventorySource } from './InventorySlots';
import { InventoryService } from './InventoryService';

/** A character's items as the Inventory window shows them. `canUnequip`: items may be taken off now. */
export function characterInventorySource(character: CharacterData, canUnequip: () => boolean = () => true): InventorySource {
  return {
    itemAt: (slot) => {
      const state = InventoryService.state(character);
      const id = slot.kind === 'equipment' ? state.equipment[slot.slot] : (state.bag[slot.index]?.itemId ?? null);
      return id === null ? null : itemInfo(id);
    },
    equip: (bagIndex, slot) => InventoryService.equip(character, bagIndex, slot) === null,
    unequip: (slot) => (canUnequip() ? InventoryService.unequip(character, slot) : { error: 'notAllowed' }),
    canUnequip,
    onChange: (listener) =>
      InventoryService.onChange((c) => {
        if (c === character) listener();
      }),
  };
}
