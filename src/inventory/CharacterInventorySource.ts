import type { CharacterData } from '../data/CharacterData';
import { itemInfo } from '../items/ItemInfoText';
import type { InventorySource } from './InventorySlots';
import { InventoryService } from './InventoryService';
import { itemDefinition } from '../items/ItemCatalog';
import { equipOption } from './InventoryState';

/** A character's items as the Inventory window shows them. `canUnequip`: items may be taken off now. */
export function characterInventorySource(character: CharacterData, canUnequip: () => boolean = () => true): InventorySource {
  return {
    itemAt: (slot) => {
      const state = InventoryService.state(character);
      const item = slot.kind === 'equipment' ? state.equipment[slot.slot] : state.bag[slot.index];
      return item ? itemInfo(item.itemId) : null;
    },
    equipOption: (bagIndex) => equipOption(InventoryService.state(character), bagIndex, character.status.level),
    equip: (bagIndex, slot) => InventoryService.equip(character, bagIndex, slot) === null,
    unequip: (slot) => (canUnequip() ? InventoryService.unequip(character, slot) : { error: 'notAllowed' }),
    canUnequip,
    consumableAt: (bagIndex) => {
      const stack = InventoryService.state(character).bag[bagIndex];
      return stack && itemDefinition(stack.itemId)?.category === 'consumable' ? stack.itemId : null;
    },
    scrollAt: (bagIndex) => {
      const stack = InventoryService.state(character).bag[bagIndex];
      return stack && itemDefinition(stack.itemId)?.category === 'skill_scroll' ? stack.itemId : null;
    },
    onChange: (listener) =>
      InventoryService.onChange((c) => {
        if (c === character) listener();
      }),
  };
}
