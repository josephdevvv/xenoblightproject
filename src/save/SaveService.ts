import { restoreCharacterData, type CharacterData } from '../data/CharacterData';
import { CharacterProfileStore, profileKey } from '../data/CharacterProfileStore';
import { InventorySaveStore, inventorySaveKey } from '../inventory/InventorySaveStore';
import { PassiveSaveStore, passiveSaveKey } from '../passives/PassiveSaveStore';
import { QuestSaveStore, questSaveKey } from '../quests/QuestSaveStore';
import { CharacterStatusService } from '../status/CharacterStatusService';
import { characterSaveKey, StatusSaveStore } from '../status/StatusSaveStore';
import type { GameSave } from './SaveFile';

/** One copy of what was replaced, so a mistake is never final. */
const BACKUP_SUFFIX = '.replaced-backup';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Every record the browser keeps of a character. */
function recordKeys(name: string): string[] {
  return [profileKey(name), characterSaveKey(name), passiveSaveKey(name), questSaveKey(name), inventorySaveKey(name)];
}

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function backup(store: Storage, keys: readonly string[]): void {
  for (const key of keys) {
    const raw = read(store, key);
    if (raw === null) continue;
    try {
      store.setItem(key + BACKUP_SUFFIX, raw);
    } catch {
      // best effort
    }
  }
}

/**
 * Restores a checked save file into the browser's own records - the only place character progress lives - and
 * loads the character from there exactly like any other session. There is no second character state.
 */
export const SaveService = {
  /** The browser has progress of a character with this name. */
  hasCharacter(name: string): boolean {
    const store = storage();
    return store !== null && [profileKey(name), characterSaveKey(name)].some((key) => read(store, key) !== null);
  },

  /**
   * Replaces the records of the saved character's name - all of them or none - and returns the loaded
   * character. null = the browser refused to store them; everything is as before. Ask the player first
   * (hasCharacter).
   */
  restore(save: GameSave): CharacterData | null {
    const store = storage();
    if (!store) return null;
    const { name } = save.profile;
    const keys = recordKeys(name);
    const before = keys.map((key) => read(store, key));
    backup(store, keys);
    const done =
      CharacterProfileStore.save(save.profile) &&
      StatusSaveStore.save(name, save.status) &&
      PassiveSaveStore.save(name, save.passives) &&
      QuestSaveStore.save(name, save.quests) &&
      InventorySaveStore.save(name, save.inventory);
    if (!done) {
      keys.forEach((key, i) => {
        try {
          if (before[i] === null) store.removeItem(key);
          else store.setItem(key, before[i]!);
        } catch {
          // best effort; the backup copy is still there
        }
      });
      return null;
    }
    if (save.repaired.length > 0) console.warn(`[save] repaired while loading "${name}":`, save.repaired);
    const character = restoreCharacterData(save.profile);
    CharacterStatusService.loadInto(character);
    CharacterProfileStore.setLastPlayed(name);
    return character;
  },

  /** Removes a character's records (a copy is kept), so the same name starts fresh. Ask the player first. */
  erase(name: string): void {
    const store = storage();
    if (!store) return;
    const keys = recordKeys(name);
    backup(store, keys);
    for (const key of keys) {
      try {
        store.removeItem(key);
      } catch {
        // best effort
      }
    }
  },
};
