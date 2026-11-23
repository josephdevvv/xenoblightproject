import type { CharacterData } from '../data/CharacterData';
import { CharacterStatusService } from '../status/CharacterStatusService';
import type { EquipmentSlotId } from './InventorySlots';
import { consumeOne, createInventory, equipFromBag, grantOnce, unequipToBag, type EquipError, type GrantError, type InventoryState, type UnequipError } from './InventoryState';

export type ItemGrant = { grantId: string; itemId: string; quantity: number };

type ChangeListener = (character: CharacterData) => void;
type GainedListener = (character: CharacterData, itemId: string, quantity: number) => void;
const changeListeners = new Set<ChangeListener>();
const gainedListeners = new Set<GainedListener>();

/**
 * The single place that changes a character's items. Every change is checked by the pure rules and becomes real
 * in one step - the whole new state or nothing - before it is announced. Items and received one-time grants are
 * one state, so a reward can never be given twice in a session, nor after loading a save file. Equipment changes
 * reach the Status window, HUD and combat through CharacterStatusService. Nothing is written to the browser.
 */
export const InventoryService = {
  state(character: CharacterData): InventoryState {
    return character.inventory ?? createInventory();
  },

  /**
   * Gives an item once per grant id and character. null = given now; 'alreadyGranted' = it was given before
   * (in this session or in the loaded save). Nothing is given twice and nothing is half given.
   */
  grantOnce(character: CharacterData, { grantId, itemId, quantity }: ItemGrant): GrantError | null {
    const result = grantOnce(this.state(character), grantId, itemId, quantity);
    if (!result.ok) return result.error;
    commit(character, result.state);
    for (const l of gainedListeners) l(character, itemId, quantity);
    return null;
  },

  /** Equips the item in a bag slot (a worn one goes back to that slot - one step). null = done. */
  equip(character: CharacterData, bagIndex: number, slot: EquipmentSlotId): EquipError | null {
    const result = equipFromBag(this.state(character), bagIndex, slot, character.status.level);
    if (!result.ok) return result.error;
    commit(character, result.state);
    return null;
  },

  /** Takes off the item in an equipment slot: the bag slot it went to, or why nothing changed. */
  unequip(character: CharacterData, slot: EquipmentSlotId): { bagIndex: number } | { error: UnequipError } {
    const result = unequipToBag(this.state(character), slot);
    if (!result.ok) return { error: result.error };
    commit(character, result.state);
    return { bagIndex: result.bagIndex };
  },

  /** Takes one of an item out of the bag (preferably from `bagIndex`). False = there was none, nothing changed. */
  consumeOne(character: CharacterData, itemId: string, bagIndex = -1): boolean {
    const result = consumeOne(this.state(character), itemId, bagIndex);
    if (!result.ok) return false;
    commit(character, result.state);
    return true;
  },

  onChange(listener: ChangeListener): () => void {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  },

  /** Fired after items were given. */
  onGained(listener: GainedListener): () => void {
    gainedListeners.add(listener);
    return () => gainedListeners.delete(listener);
  },
};

function commit(character: CharacterData, state: InventoryState): void {
  character.inventory = state;
  CharacterStatusService.refresh(character);
  for (const l of changeListeners) l(character);
}
