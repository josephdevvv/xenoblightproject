import type { CharacterData } from '../data/CharacterData';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { InventorySaveStore, loadSavedInventory } from './InventorySaveStore';
import type { EquipmentSlotId } from './InventorySlots';
import { createInventory, equipFromBag, grantOnce, hasGrant, sanitizeInventory, unequipToBag, type EquipError, type GrantError, type InventoryState, type UnequipError } from './InventoryState';

export type ItemGrant = { grantId: string; itemId: string; quantity: number };

type ChangeListener = (character: CharacterData) => void;
type GainedListener = (character: CharacterData, itemId: string, quantity: number) => void;
const changeListeners = new Set<ChangeListener>();
const gainedListeners = new Set<GainedListener>();

/**
 * The single place that changes a character's items. Every change is checked by the pure rules, SAVED FIRST
 * and only then becomes real and is announced: an item that could not be saved is not given. Equipment
 * changes reach the Status window, HUD and combat through CharacterStatusService.
 * (Loading happens with the status, in CharacterStatusService.)
 */
export const InventoryService = {
  state(character: CharacterData): InventoryState {
    return character.inventory ?? createInventory();
  },

  /**
   * Gives an item once per grant id and character. null = given now; 'alreadyGranted' = it was given before
   * (also by another tab or an earlier session: the stored record is read again). Nothing is given twice and
   * nothing is half given.
   */
  grantOnce(character: CharacterData, { grantId, itemId, quantity }: ItemGrant): GrantError | 'notSaved' | null {
    const saved = loadSavedInventory(character.name);
    if (saved !== null) {
      const { state: stored, newIds } = sanitizeInventory(saved);
      if (hasGrant(stored, grantId) && !hasGrant(character.inventory, grantId)) {
        if (newIds > 0) InventorySaveStore.save(character.name, stored);
        announce(character, stored);
      }
    }
    const result = grantOnce(this.state(character), grantId, itemId, quantity);
    if (!result.ok) return result.error;
    if (!commit(character, result.state)) return 'notSaved';
    for (const l of gainedListeners) l(character, itemId, quantity);
    return null;
  },

  /** Equips the item in a bag slot (a worn one goes back to that slot - one saved step). null = done. */
  equip(character: CharacterData, bagIndex: number, slot: EquipmentSlotId): EquipError | 'notSaved' | null {
    const result = equipFromBag(this.state(character), bagIndex, slot, character.status.level);
    if (!result.ok) return result.error;
    return commit(character, result.state) ? null : 'notSaved';
  },

  /** Takes off the item in an equipment slot: the bag slot it went to, or why nothing changed. */
  unequip(character: CharacterData, slot: EquipmentSlotId): { bagIndex: number } | { error: UnequipError | 'notSaved' } {
    const result = unequipToBag(this.state(character), slot);
    if (!result.ok) return { error: result.error };
    return commit(character, result.state) ? { bagIndex: result.bagIndex } : { error: 'notSaved' };
  },

  onChange(listener: ChangeListener): () => void {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  /** Fired after items were given (and saved). */
  onGained(listener: GainedListener): () => void {
    gainedListeners.add(listener);
    return () => gainedListeners.delete(listener);
  },
};

function commit(character: CharacterData, state: InventoryState): boolean {
  if (!InventorySaveStore.save(character.name, state)) return false;
  announce(character, state);
  return true;
}

function announce(character: CharacterData, state: InventoryState): void {
  character.inventory = state;
  CharacterStatusService.refresh(character);
  for (const l of changeListeners) l(character);
}
