import type { CharacterData } from '../data/CharacterData';
import { itemCount } from '../inventory/InventoryState';
import { assignItem, createHotbar, type HotbarState } from './Hotbar';

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();

/** The single place that changes a character's hotbar (assignments only - using a slot goes through GameScene). */
export const HotbarService = {
  state(character: CharacterData): HotbarState {
    return character.hotbar ?? createHotbar();
  },

  /** Puts an item the character owns on a slot (moved there if it was on another one). False = nothing changed. */
  assignItem(character: CharacterData, slot: number, itemId: string): boolean {
    if (itemCount(character.inventory, itemId) < 1) return false;
    const next = assignItem(this.state(character), slot, itemId);
    if (!next) return false;
    character.hotbar = next;
    for (const l of listeners) l(character);
    return true;
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
