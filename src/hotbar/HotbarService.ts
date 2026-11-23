import type { CharacterData } from '../data/CharacterData';
import { itemCount } from '../inventory/InventoryState';
import { isSkillUnlocked } from '../skills/ActiveSkills';
import { assignEntry, createHotbar, type HotbarEntry, type HotbarState } from './Hotbar';
import { assignPotion, createPotionSlots, type PotionSlotKey, type PotionSlots } from './PotionSlots';

type Listener = (character: CharacterData) => void;
const listeners = new Set<Listener>();

/** The single place that changes a character's hotbar (assignments only - using a slot goes through GameScene). */
export const HotbarService = {
  state(character: CharacterData): HotbarState {
    return character.hotbar ?? createHotbar();
  },

  /** Puts an item the character owns on a slot (moved there if it was on another one). False = nothing changed. */
  assignItem(character: CharacterData, slot: number, itemId: string): boolean {
    return this.assign(character, slot, { type: 'item', itemId });
  },

  /** Puts a LEARNED skill on a slot (a locked one never). False = nothing changed. */
  assignSkill(character: CharacterData, slot: number, skillId: string): boolean {
    return this.assign(character, slot, { type: 'skill', skillId });
  },

  /** Either kind of entry, with its own condition (an owned item, a learned skill). */
  assign(character: CharacterData, slot: number, entry: HotbarEntry): boolean {
    if (entry.type === 'item' ? itemCount(character.inventory, entry.itemId) < 1 : !isSkillUnlocked(character, entry.skillId)) return false;
    const next = assignEntry(this.state(character), slot, entry);
    if (!next) return false;
    character.hotbar = next;
    for (const l of listeners) l(character);
    return true;
  },

  /** The Q (HP) / W (SP) potion slots. */
  potions(character: CharacterData): PotionSlots {
    return character.potionSlots ?? createPotionSlots();
  },

  /**
   * "Assign Hotkey" on a potion the character owns: an HP potion goes on Q, an SP potion on W, replacing the one
   * there. Nothing is used up. null = not a potion / not owned (nothing changed).
   */
  assignPotion(character: CharacterData, itemId: string): PotionSlotKey | null {
    if (itemCount(character.inventory, itemId) < 1) return null;
    const result = assignPotion(this.potions(character), itemId);
    if (!result) return null;
    character.potionSlots = result.slots;
    for (const l of listeners) l(character);
    return result.key;
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
